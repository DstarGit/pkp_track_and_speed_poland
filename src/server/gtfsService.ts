import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import type {
  ApiErrorPayload,
  CarrierSummary,
  CategoryGroup,
  ConnectionsResponse,
  LongestConnection,
  LongestSegmentsResponse,
  RouteStop,
  SpeedSegmentRecord,
  SpeedsResponse,
} from '../types/railway.ts';

const GTFS_FEED_URL = 'https://mkuran.pl/gtfs/polish_trains.zip';
const CACHE_DIR = path.resolve(process.cwd(), '.cache', 'gtfs');
const LOCAL_ZIP_PATH = path.join(CACHE_DIR, 'polish_trains.zip');
const FEED_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DATE_RESULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class GtfsServiceError extends Error {
  public readonly payload: ApiErrorPayload;
  public readonly statusCode: number;

  constructor(statusCode: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

interface StopMeta {
  stopId: string;
  numericId: number;
  name: string;
  lat: number | null;
  lon: number | null;
  country: string | null;
}

interface AgencyMeta {
  id: string;
  name: string;
}

interface RouteMeta {
  routeId: string;
  agencyId: string;
  shortName: string;
  longName: string;
  routeType: string;
}

interface TripMeta {
  tripId: string;
  routeId: string;
  serviceId: string;
  shapeId: string;
  shortName: string;
  headsign: string;
  categoryCode: string;
  trainNumber: string;
  trainName: string;
}

interface FeedMetadata {
  version: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface StopTimeRow {
  stopSequence: number;
  stopId: string;
  arrivalSeconds: number | null;
  departureSeconds: number | null;
  shapeDistKm: number | null;
  platform: string | null;
  track: string | null;
  categoryCode: string | null;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const dateResultsCache = new Map<string, CacheEntry<ConnectionsResponse>>();
const speedsResultsCache = new Map<string, CacheEntry<SpeedsResponse>>();
const longestSegmentsResultsCache = new Map<string, CacheEntry<LongestSegmentsResponse>>();
const tripDetailsCache = new Map<string, CacheEntry<LongestConnection>>();
let lastFeedDownloadMs = 0;
let activeDownloadPromise: Promise<void> | null = null;

function parseCsvLine(line: string): string[] {
  if (!line.includes('"')) {
    return line.split(',');
  }
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function stableNumericId(str: string): number {
  const digitsMatch = /^(\d+)/.exec(str);
  if (digitsMatch) {
    const parsed = Number(digitsMatch[1]);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 1000000000;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function parseGtfsTimeToSeconds(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(timeStr.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

function formatGtfsSeconds(totalSeconds: number): { hhmm: string; dayOffset: number } {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const dayOffset = Math.floor(totalMinutes / 1440);
  const modMinutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(modMinutes / 60)).padStart(2, '0');
  const mm = String(modMinutes % 60).padStart(2, '0');
  return { hhmm: `${hh}:${mm}`, dayOffset };
}

function formatYyyymmddToIso(yyyymmdd: string | null): string | null {
  if (!yyyymmdd || !/^\d{8}$/.test(yyyymmdd)) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function getTodayWarsawDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function normalizeCategoryGroup(categorySymbol: string, routeShortName: string): CategoryGroup {
  const raw = `${categorySymbol} ${routeShortName}`.toUpperCase();
  if (raw.includes('EIP')) return 'EIP';
  if (/\bEIC\b|\bEC\b|EC\/EIC/.test(raw)) return 'EIC_EC';
  if (/\bTLK\b|\bIR\b|\bEX\b/.test(raw)) return 'TLK_IR';
  if (/\bIC\b|IC\+|IC\/MP|EN\/IC|\bMP\b|\bEN\b|\bICN\b|\bRJ\b|\bLE\b/.test(raw)) return 'IC';
  if (
    /OSP|\bRE\d*\b|SPRINTER|PRZYSPIESZ|\bRP\b|\bŁP\b|\bŁS\b|K\d+P\b|SKA\d+P\b/.test(raw)
  ) {
    return 'ACCELERATED';
  }
  return 'LOCAL';
}

async function ensureFeedZip(forceRefresh = false): Promise<string> {
  const now = Date.now();
  let fileExists = false;
  try {
    const stat = await fs.promises.stat(LOCAL_ZIP_PATH);
    if (stat.size > 1024 * 1024) {
      fileExists = true;
      if (lastFeedDownloadMs === 0) {
        lastFeedDownloadMs = stat.mtimeMs;
      }
    }
  } catch {
    fileExists = false;
  }

  if (!forceRefresh && fileExists && now - lastFeedDownloadMs < FEED_TTL_MS) {
    return LOCAL_ZIP_PATH;
  }

  if (activeDownloadPromise) {
    await activeDownloadPromise;
    return LOCAL_ZIP_PATH;
  }

  activeDownloadPromise = (async () => {
    try {
      const response = await fetch(GTFS_FEED_URL, {
        method: 'GET',
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const tmpPath = `${LOCAL_ZIP_PATH}.tmp`;
      await fs.promises.mkdir(CACHE_DIR, { recursive: true });
      await fs.promises.writeFile(tmpPath, buffer);
      await fs.promises.rename(tmpPath, LOCAL_ZIP_PATH);
      lastFeedDownloadMs = Date.now();
    } catch (err) {
      if (fileExists) {
        return;
      }
      throw new GtfsServiceError(502, {
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Nie udało się pobrać paczki Polish Trains GTFS.',
        details: err instanceof Error ? err.message : 'Błąd połączenia z mkuran.pl/gtfs/polish_trains.zip.',
      });
    } finally {
      activeDownloadPromise = null;
    }
  })();

  await activeDownloadPromise;
  return LOCAL_ZIP_PATH;
}

function iterateZipLines(zip: AdmZip, entryName: string, onLine: (line: string, index: number) => void) {
  const entry = zip.getEntry(entryName);
  if (!entry) return;
  const text = entry.getData().toString('utf8');
  let start = 0;
  let lineIndex = 0;
  const len = text.length;

  for (let i = 0; i <= len; i++) {
    if (i === len || text.charCodeAt(i) === 10) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13) {
        end -= 1;
      }
      if (end > start) {
        onLine(text.slice(start, end), lineIndex);
        lineIndex += 1;
      }
      start = i + 1;
    }
  }
}

function readFeedMetadata(zip: AdmZip): FeedMetadata {
  let version: string | null = null;
  let startDate: string | null = null;
  let endDate: string | null = null;
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'feed_info.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((col, i) => {
        cols[col.trim()] = i;
      });
      return;
    }
    if (idx === 1) {
      version = parts[cols.feed_version] || null;
      startDate = formatYyyymmddToIso(parts[cols.feed_start_date] || null);
      endDate = formatYyyymmddToIso(parts[cols.feed_end_date] || null);
    }
  });

  return { version, startDate, endDate };
}

function readAgencies(zip: AdmZip): Map<string, AgencyMeta> {
  const map = new Map<string, AgencyMeta>();
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'agency.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      return;
    }
    const id = parts[cols.agency_id]?.trim();
    const name = parts[cols.agency_name]?.trim();
    if (id) {
      map.set(id, { id, name: name || id });
    }
  });

  return map;
}

function readRoutes(zip: AdmZip): Map<string, RouteMeta> {
  const map = new Map<string, RouteMeta>();
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'routes.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      return;
    }
    const routeId = parts[cols.route_id]?.trim();
    if (!routeId) return;
    map.set(routeId, {
      routeId,
      agencyId: parts[cols.agency_id]?.trim() || '',
      shortName: parts[cols.route_short_name]?.trim() || '',
      longName: parts[cols.route_long_name]?.trim() || '',
      routeType: parts[cols.route_type]?.trim() || '2',
    });
  });

  return map;
}

function readActiveServicesForDate(zip: AdmZip, targetYyyymmdd: string): Set<string> {
  const active = new Set<string>();
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'calendar_dates.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      return;
    }
    const dateVal = parts[cols.date]?.trim();
    if (dateVal !== targetYyyymmdd) return;
    const serviceId = parts[cols.service_id]?.trim();
    const exType = parts[cols.exception_type]?.trim();
    if (!serviceId) return;
    if (exType === '1') {
      active.add(serviceId);
    } else if (exType === '2') {
      active.delete(serviceId);
    }
  });

  return active;
}

function readStops(zip: AdmZip): Map<string, StopMeta> {
  const map = new Map<string, StopMeta>();
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'stops.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      return;
    }
    const stopId = parts[cols.stop_id]?.trim();
    if (!stopId) return;
    const latRaw = Number(parts[cols.stop_lat]);
    const lonRaw = Number(parts[cols.stop_lon]);
    map.set(stopId, {
      stopId,
      numericId: stableNumericId(stopId),
      name: parts[cols.stop_name]?.trim() || stopId,
      lat: Number.isFinite(latRaw) ? latRaw : null,
      lon: Number.isFinite(lonRaw) ? lonRaw : null,
      country: parts[cols.country]?.trim() || null,
    });
  });

  return map;
}

function readActiveRailTrips(
  zip: AdmZip,
  activeServices: Set<string> | null,
  routesMap: Map<string, RouteMeta>,
  onlyTripId?: string,
): Map<string, TripMeta> {
  const map = new Map<string, TripMeta>();
  const cols: Record<string, number> = {};

  iterateZipLines(zip, 'trips.txt', (line, idx) => {
    const parts = parseCsvLine(line);
    if (idx === 0) {
      parts.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      return;
    }

    const tripId = parts[cols.trip_id]?.trim();
    if (!tripId) return;
    if (onlyTripId && tripId !== onlyTripId) return;

    const serviceId = parts[cols.service_id]?.trim();
    if (activeServices && (!serviceId || !activeServices.has(serviceId))) return;

    const routeId = parts[cols.route_id]?.trim() || '';
    const route = routesMap.get(routeId);
    if (route && route.routeType === '3') return;

    map.set(tripId, {
      tripId,
      routeId,
      serviceId: serviceId || '',
      shapeId: parts[cols.shape_id]?.trim() || '',
      shortName: parts[cols.trip_short_name]?.trim() || '',
      headsign: parts[cols.trip_headsign]?.trim() || '',
      categoryCode: parts[cols.plk_category_code]?.trim() || '',
      trainNumber: parts[cols.plk_train_number]?.trim() || '',
      trainName: parts[cols.plk_train_name]?.trim() || '',
    });
  });

  return map;
}

function readStopTimesForTrips(
  zip: AdmZip,
  activeTrips: Map<string, TripMeta>,
): Map<string, StopTimeRow[]> {
  const grouped = new Map<string, StopTimeRow[]>();
  const cols: Record<string, number> = {};
  let tripIdCol = 0;

  iterateZipLines(zip, 'stop_times.txt', (line, idx) => {
    if (idx === 0) {
      const header = parseCsvLine(line);
      header.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      tripIdCol = cols.trip_id ?? 0;
      return;
    }

    if (tripIdCol === 0) {
      const firstComma = line.indexOf(',');
      if (firstComma <= 0) return;
      const tripIdFast = line.slice(0, firstComma);
      if (!activeTrips.has(tripIdFast)) return;
    }

    const parts = parseCsvLine(line);
    const tripId = parts[tripIdCol]?.trim();
    if (!tripId || !activeTrips.has(tripId)) return;

    const seq = Number(parts[cols.stop_sequence]);
    if (Number.isNaN(seq)) return;

    const distRaw = parts[cols.shape_dist_traveled];
    const distNum = distRaw ? Number(distRaw) : NaN;

    const row: StopTimeRow = {
      stopSequence: seq,
      stopId: parts[cols.stop_id]?.trim() || '',
      arrivalSeconds: parseGtfsTimeToSeconds(parts[cols.arrival_time]),
      departureSeconds: parseGtfsTimeToSeconds(parts[cols.departure_time]),
      shapeDistKm: Number.isFinite(distNum) ? distNum : null,
      platform: parts[cols.platform]?.trim() || null,
      track: parts[cols.track]?.trim() || null,
      categoryCode: parts[cols.plk_category_code]?.trim() || null,
    };

    let list = grouped.get(tripId);
    if (!list) {
      list = [];
      grouped.set(tripId, list);
    }
    list.push(row);
  });

  return grouped;
}

function readShapesForIds(
  zip: AdmZip,
  neededShapeIds: Set<string>,
): Map<string, [number, number][]> {
  const rawShapes = new Map<string, { seq: number; lat: number; lon: number }[]>();
  if (neededShapeIds.size === 0) return new Map();

  const cols: Record<string, number> = {};
  let shapeIdCol = 0;

  iterateZipLines(zip, 'shapes.txt', (line, idx) => {
    if (idx === 0) {
      const header = parseCsvLine(line);
      header.forEach((c, i) => {
        cols[c.trim()] = i;
      });
      shapeIdCol = cols.shape_id ?? 0;
      return;
    }

    if (shapeIdCol === 0) {
      const firstComma = line.indexOf(',');
      if (firstComma <= 0) return;
      const shapeIdFast = line.slice(0, firstComma);
      if (!neededShapeIds.has(shapeIdFast)) return;
    }

    const parts = parseCsvLine(line);
    const shapeId = parts[shapeIdCol]?.trim();
    if (!shapeId || !neededShapeIds.has(shapeId)) return;

    const seq = Number(parts[cols.shape_pt_sequence]);
    const lat = Number(parts[cols.shape_pt_lat]);
    const lon = Number(parts[cols.shape_pt_lon]);
    if (!Number.isFinite(seq) || !Number.isFinite(lat) || !Number.isFinite(lon)) return;

    let list = rawShapes.get(shapeId);
    if (!list) {
      list = [];
      rawShapes.set(shapeId, list);
    }
    list.push({ seq, lat, lon });
  });

  const simplified = new Map<string, [number, number][]>();
  for (const [shapeId, pts] of rawShapes.entries()) {
    pts.sort((a, b) => a.seq - b.seq);
    const maxPts = 180;
    if (pts.length <= maxPts) {
      simplified.set(
        shapeId,
        pts.map((p) => [Math.round(p.lat * 10000) / 10000, Math.round(p.lon * 10000) / 10000]),
      );
    } else {
      const step = (pts.length - 1) / (maxPts - 1);
      const sampled: [number, number][] = [];
      for (let i = 0; i < maxPts; i++) {
        const pt = pts[Math.round(i * step)];
        sampled.push([Math.round(pt.lat * 10000) / 10000, Math.round(pt.lon * 10000) / 10000]);
      }
      simplified.set(shapeId, sampled);
    }
  }

  return simplified;
}

function buildConnectionWithSegments(
  trip: TripMeta,
  rawStops: StopTimeRow[],
  stopsMap: Map<string, StopMeta>,
  routesMap: Map<string, RouteMeta>,
  agenciesMap: Map<string, AgencyMeta>,
): { connection: LongestConnection; shapeId: string; segments: SpeedSegmentRecord[] } | null {
  if (rawStops.length < 2) return null;
  rawStops.sort((a, b) => a.stopSequence - b.stopSequence);

  const firstRaw = rawStops[0];
  const lastRaw = rawStops[rawStops.length - 1];

  const startSec = firstRaw.departureSeconds ?? firstRaw.arrivalSeconds;
  const endSec = lastRaw.arrivalSeconds ?? lastRaw.departureSeconds;
  if (startSec === null || endSec === null) return null;

  const durationSeconds = endSec >= startSec ? endSec - startSec : endSec + 86400 - startSec;
  if (durationSeconds <= 0 || durationSeconds > 48 * 3600) return null;
  const durationMinutes = Math.round(durationSeconds / 60);

  const hasValidShapeDist =
    typeof firstRaw.shapeDistKm === 'number' &&
    typeof lastRaw.shapeDistKm === 'number' &&
    lastRaw.shapeDistKm > firstRaw.shapeDistKm;

  const baseShapeKm = hasValidShapeDist ? (firstRaw.shapeDistKm as number) : 0;

  let prevCoord: { lat: number; lon: number } | null = null;
  let haversineCumulativeKm = 0;
  let prevCumulativeKm = 0;

  const stops: RouteStop[] = rawStops.map((row, idx) => {
    const isOrigin = idx === 0;
    const isDestination = idx === rawStops.length - 1;
    const meta = stopsMap.get(row.stopId);
    const lat = meta?.lat ?? null;
    const lon = meta?.lon ?? null;

    let haversineSeg = 0;
    if (lat !== null && lon !== null) {
      if (prevCoord) {
        haversineSeg = haversineKm(prevCoord.lat, prevCoord.lon, lat, lon);
        haversineCumulativeKm += haversineSeg;
      }
      prevCoord = { lat, lon };
    }

    let cumulativeKm = haversineCumulativeKm;
    if (hasValidShapeDist && typeof row.shapeDistKm === 'number') {
      const candidate = Math.max(0, row.shapeDistKm - baseShapeKm);
      if (candidate >= prevCumulativeKm) {
        cumulativeKm = candidate;
      }
    }

    const segmentKm = Math.max(0, cumulativeKm - prevCumulativeKm);
    prevCumulativeKm = cumulativeKm;

    const arrFormatted =
      !isOrigin && row.arrivalSeconds !== null ? formatGtfsSeconds(row.arrivalSeconds) : null;
    const depFormatted =
      !isDestination && row.departureSeconds !== null
        ? formatGtfsSeconds(row.departureSeconds)
        : null;

    let dwellMinutes: number | null = null;
    if (
      !isOrigin &&
      !isDestination &&
      row.arrivalSeconds !== null &&
      row.departureSeconds !== null &&
      row.departureSeconds >= row.arrivalSeconds
    ) {
      dwellMinutes = Math.round((row.departureSeconds - row.arrivalSeconds) / 60);
    }

    let segmentDurationSeconds: number | null = null;
    let segmentSpeedKmh: number | null = null;
    if (idx > 0) {
      const prevRow = rawStops[idx - 1];
      const prevDep = prevRow.departureSeconds ?? prevRow.arrivalSeconds;
      const currArr = row.arrivalSeconds ?? row.departureSeconds;
      if (prevDep !== null && currArr !== null) {
        const diffSec = currArr >= prevDep ? currArr - prevDep : currArr + 86400 - prevDep;
        if (diffSec > 0 && diffSec <= 12 * 3600 && segmentKm > 0.2) {
          const speed = segmentKm / (diffSec / 3600);
          if (speed > 0 && speed <= 260) {
            segmentDurationSeconds = diffSec;
            segmentSpeedKmh = Math.round(speed * 10) / 10;
          }
        }
      }
    }

    return {
      stationId: meta?.numericId ?? stableNumericId(row.stopId),
      orderNumber: idx + 1,
      name: meta?.name ?? row.stopId,
      latitude: lat,
      longitude: lon,
      arrivalTime: arrFormatted?.hhmm ?? null,
      departureTime: depFormatted?.hhmm ?? null,
      arrivalDayOffset: arrFormatted?.dayOffset ?? 0,
      departureDayOffset: depFormatted?.dayOffset ?? 0,
      dwellMinutes,
      platform: row.platform,
      track: row.track,
      cumulativeKm: Math.round(cumulativeKm * 10) / 10,
      segmentKm: Math.round(segmentKm * 10) / 10,
      segmentDurationSeconds,
      segmentSpeedKmh,
      stopTypeName: null,
      country: meta?.country ?? null,
      isOrigin,
      isDestination,
    };
  });

  const firstStop = stops[0];
  const lastStop = stops[stops.length - 1];
  const isDomestic = stops.every((s) => !s.country || s.country === 'PL');
  const distanceKm = lastStop.cumulativeKm;
  if (distanceKm <= 5) return null;

  const avgSpeedKmh = Math.round((distanceKm / (durationSeconds / 3600)) * 10) / 10;
  if (avgSpeedKmh <= 0 || avgSpeedKmh > 260) return null;

  let directDistanceKm = 0;
  if (
    firstStop.latitude !== null &&
    firstStop.longitude !== null &&
    lastStop.latitude !== null &&
    lastStop.longitude !== null
  ) {
    directDistanceKm =
      Math.round(
        haversineKm(firstStop.latitude, firstStop.longitude, lastStop.latitude, lastStop.longitude) *
          10,
      ) / 10;
  }

  const startFormatted = formatGtfsSeconds(startSec);
  const endFormatted = formatGtfsSeconds(endSec);
  const endDayOffset = Math.max(0, endFormatted.dayOffset - startFormatted.dayOffset);

  const route = routesMap.get(trip.routeId);
  const agency = route ? agenciesMap.get(route.agencyId) : undefined;
  const carrierCode = route?.agencyId || 'INNY';
  const carrierName = agency?.name || carrierCode;

  const categorySymbol =
    trip.categoryCode ||
    firstRaw.categoryCode ||
    route?.shortName ||
    carrierCode;

  const categoryGroup = normalizeCategoryGroup(categorySymbol, route?.shortName ?? '');

  const trainNumber =
    trip.trainNumber ||
    trip.shortName.split(' ')[0] ||
    trip.tripId;

  const connection: LongestConnection = {
    id: trip.tripId,
    scheduleId: 0,
    orderId: stableNumericId(trip.tripId),
    trainNumber,
    trainName: trip.trainName || null,
    carrierCode,
    carrierName,
    categorySymbol,
    categoryGroup,
    originName: firstStop.name,
    originId: firstStop.stationId,
    destinationName: lastStop.name,
    destinationId: lastStop.stationId,
    startTime: startFormatted.hhmm,
    endTime: endFormatted.hhmm,
    endDayOffset,
    durationMinutes,
    durationSeconds,
    distanceKm,
    directDistanceKm,
    avgSpeedKmh,
    stopsCount: stops.length,
    isDomestic,
    stops,
    distanceSource: hasValidShapeDist ? 'gtfs_shape' : 'haversine',
    live: null,
  };

  const segments: SpeedSegmentRecord[] = [];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const curr = stops[i];
    if (
      curr.segmentDurationSeconds !== null &&
      curr.segmentSpeedKmh !== null &&
      curr.segmentKm > 0.2 &&
      prev.departureTime &&
      curr.arrivalTime
    ) {
      const segDomestic =
        (!prev.country || prev.country === 'PL') && (!curr.country || curr.country === 'PL');

      segments.push({
        id: `${trip.tripId}#${prev.orderNumber}-${curr.orderNumber}`,
        tripId: trip.tripId,
        trainNumber,
        trainName: trip.trainName || null,
        carrierCode,
        carrierName,
        categorySymbol,
        categoryGroup,
        fromStationId: prev.stationId,
        fromStationName: prev.name,
        fromLat: prev.latitude,
        fromLon: prev.longitude,
        toStationId: curr.stationId,
        toStationName: curr.name,
        toLat: curr.latitude,
        toLon: curr.longitude,
        departureTime: prev.departureTime,
        arrivalTime: curr.arrivalTime,
        endDayOffset: Math.max(0, curr.arrivalDayOffset - prev.departureDayOffset),
        distanceKm: curr.segmentKm,
        durationSeconds: curr.segmentDurationSeconds,
        avgSpeedKmh: curr.segmentSpeedKmh,
        isDomestic: segDomestic,
        routeOriginName: firstStop.name,
        routeDestinationName: lastStop.name,
      });
    }
  }

  return { connection, shapeId: trip.shapeId, segments };
}

function loadActiveDayBuiltTrips(zip: AdmZip, date: string) {
  const feedMeta = readFeedMetadata(zip);
  const targetYyyymmdd = date.replace(/-/g, '');
  const activeServices = readActiveServicesForDate(zip, targetYyyymmdd);

  if (activeServices.size === 0) {
    const rangeHint =
      feedMeta.startDate && feedMeta.endDate
        ? `Aktualna paczka Polish Trains GTFS obejmuje okres od ${feedMeta.startDate} do ${feedMeta.endDate}.`
        : 'Sprawdź wybraną datę.';
    throw new GtfsServiceError(404, {
      code: 'OUT_OF_RANGE',
      message: `Brak kursów kolejowych w paczce GTFS dla daty ${date}.`,
      details: rangeHint,
    });
  }

  const agenciesMap = readAgencies(zip);
  const routesMap = readRoutes(zip);
  const stopsMap = readStops(zip);
  const activeTrips = readActiveRailTrips(zip, activeServices, routesMap);
  const stopTimesByTrip = readStopTimesForTrips(zip, activeTrips);

  const built: {
    connection: LongestConnection;
    shapeId: string;
    segments: SpeedSegmentRecord[];
  }[] = [];

  for (const [tripId, trip] of activeTrips.entries()) {
    const stRows = stopTimesByTrip.get(tripId);
    if (!stRows) continue;
    const item = buildConnectionWithSegments(trip, stRows, stopsMap, routesMap, agenciesMap);
    if (item) {
      built.push(item);
    }
  }

  return { feedMeta, stopsMap, built };
}

async function openZipArchive(forceRefresh = false): Promise<AdmZip> {
  const zipPath = await ensureFeedZip(forceRefresh);
  try {
    return new AdmZip(zipPath);
  } catch (err) {
    throw new GtfsServiceError(500, {
      code: 'PARSE_ERROR',
      message: 'Nie udało się otworzyć archiwum GTFS.',
      details: err instanceof Error ? err.message : undefined,
    });
  }
}

export async function fetchLongestConnections(
  requestedDate?: string,
  forceRefresh = false,
): Promise<ConnectionsResponse> {
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getTodayWarsawDate();

  const now = Date.now();
  const cached = dateResultsCache.get(date);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return { ...cached.value, fromCache: true };
  }

  const diskCachePath = path.join(CACHE_DIR, `connections-v3-${date}.json`);
  if (!forceRefresh) {
    try {
      const stat = await fs.promises.stat(diskCachePath);
      if (now - stat.mtimeMs < DATE_RESULT_TTL_MS) {
        const rawJson = await fs.promises.readFile(diskCachePath, 'utf8');
        const parsed = JSON.parse(rawJson) as ConnectionsResponse;
        dateResultsCache.set(date, {
          value: parsed,
          expiresAt: stat.mtimeMs + DATE_RESULT_TTL_MS,
        });
        return { ...parsed, fromCache: true };
      }
    } catch {
      // Cache miss — parse from GTFS zip
    }
  }

  const zip = await openZipArchive(forceRefresh);
  const { feedMeta, stopsMap, built } = loadActiveDayBuiltTrips(zip, date);

  const domestic = built.filter((b) => b.connection.isDomestic);
  const byDistance = [...built]
    .sort((a, b) => b.connection.distanceKm - a.connection.distanceKm)
    .slice(0, 100);
  const byDuration = [...built]
    .sort((a, b) => b.connection.durationMinutes - a.connection.durationMinutes)
    .slice(0, 100);
  const domesticByDistance = [...domestic]
    .sort((a, b) => b.connection.distanceKm - a.connection.distanceKm)
    .slice(0, 100);
  const domesticByDuration = [...domestic]
    .sort((a, b) => b.connection.durationMinutes - a.connection.durationMinutes)
    .slice(0, 100);

  const byCarrier = new Map<string, typeof built>();
  for (const item of built) {
    const code = item.connection.carrierCode;
    let list = byCarrier.get(code);
    if (!list) {
      list = [];
      byCarrier.set(code, list);
    }
    list.push(item);
  }

  const perCarrierTop: typeof built = [];
  for (const list of byCarrier.values()) {
    const topDist = [...list]
      .sort((a, b) => b.connection.distanceKm - a.connection.distanceKm)
      .slice(0, 35);
    const topDur = [...list]
      .sort((a, b) => b.connection.durationMinutes - a.connection.durationMinutes)
      .slice(0, 35);
    perCarrierTop.push(...topDist, ...topDur);
  }

  const selectedMap = new Map<string, (typeof built)[number]>();
  for (const item of [
    ...byDistance,
    ...byDuration,
    ...domesticByDistance,
    ...domesticByDuration,
    ...perCarrierTop,
  ]) {
    selectedMap.set(item.connection.id, item);
  }

  const neededShapeIds = new Set<string>();
  for (const item of selectedMap.values()) {
    if (item.shapeId) neededShapeIds.add(item.shapeId);
  }
  const shapesMap = readShapesForIds(zip, neededShapeIds);

  const connections: LongestConnection[] = Array.from(selectedMap.values())
    .map(({ connection, shapeId }) => {
      const pts = shapeId ? shapesMap.get(shapeId) : undefined;
      return pts && pts.length >= 2 ? { ...connection, shapePoints: pts } : connection;
    })
    .sort((a, b) => b.distanceKm - a.distanceKm);

  const carrierCounts = new Map<string, { name: string; count: number }>();
  for (const c of connections) {
    const existing = carrierCounts.get(c.carrierCode);
    if (existing) {
      existing.count += 1;
    } else {
      carrierCounts.set(c.carrierCode, { name: c.carrierName, count: 1 });
    }
  }

  const carriers: CarrierSummary[] = Array.from(carrierCounts.entries())
    .map(([code, meta]) => ({ code, name: meta.name, count: meta.count }))
    .sort((a, b) => b.count - a.count);

  const result: ConnectionsResponse = {
    date,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    hasLiveOperations: false,
    sourceName: 'Polish Trains GTFS (mkuran.pl)',
    feedVersion: feedMeta.version,
    feedDateRange:
      feedMeta.startDate && feedMeta.endDate
        ? { from: feedMeta.startDate, to: feedMeta.endDate }
        : null,
    totalAnalyzedRoutes: built.length,
    hubStationsMatched: stopsMap.size,
    connections,
    carriers,
  };

  dateResultsCache.set(date, { value: result, expiresAt: now + DATE_RESULT_TTL_MS });

  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    const tmpJsonPath = `${diskCachePath}.tmp`;
    await fs.promises.writeFile(tmpJsonPath, JSON.stringify(result), 'utf8');
    await fs.promises.rename(tmpJsonPath, diskCachePath);
  } catch {
    // Non-fatal
  }

  return result;
}

export async function fetchFastestSegments(
  requestedDate?: string,
  forceRefresh = false,
): Promise<SpeedsResponse> {
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getTodayWarsawDate();

  const now = Date.now();
  const cached = speedsResultsCache.get(date);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return { ...cached.value, fromCache: true };
  }

  const diskCachePath = path.join(CACHE_DIR, `speeds-v3-${date}.json`);
  if (!forceRefresh) {
    try {
      const stat = await fs.promises.stat(diskCachePath);
      if (now - stat.mtimeMs < DATE_RESULT_TTL_MS) {
        const rawJson = await fs.promises.readFile(diskCachePath, 'utf8');
        const parsed = JSON.parse(rawJson) as SpeedsResponse;
        speedsResultsCache.set(date, {
          value: parsed,
          expiresAt: stat.mtimeMs + DATE_RESULT_TTL_MS,
        });
        return { ...parsed, fromCache: true };
      }
    } catch {
      // Cache miss
    }
  }

  const zip = await openZipArchive(forceRefresh);
  const { feedMeta, built } = loadActiveDayBuiltTrips(zip, date);

  // Collect all valid segments across all active trains on target date
  const allSegments: SpeedSegmentRecord[] = [];
  for (const item of built) {
    for (const seg of item.segments) {
      allSegments.push(seg);
    }
  }
  allSegments.sort((a, b) => b.avgSpeedKmh - a.avgSpeedKmh || b.distanceKm - a.distanceKm);

  const selectedSegmentsMap = new Map<string, SpeedSegmentRecord>();
  const addTop = (predicate: (s: SpeedSegmentRecord) => boolean, limit: number) => {
    let added = 0;
    for (const s of allSegments) {
      if (!predicate(s)) continue;
      if (!selectedSegmentsMap.has(s.id)) {
        selectedSegmentsMap.set(s.id, s);
      }
      added += 1;
      if (added >= limit) break;
    }
  };

  // Top overall + distance buckets
  addTop(() => true, 140);
  addTop((s) => s.distanceKm >= 5, 100);
  addTop((s) => s.distanceKm >= 10, 120);
  addTop((s) => s.distanceKm >= 25, 100);
  addTop((s) => s.distanceKm >= 50, 100);

  // Top per carrier and per category group (for both all and >=10km)
  const carrierCodes = Array.from(new Set(built.map((b) => b.connection.carrierCode)));
  const categoryGroups: CategoryGroup[] = [
    'EIP',
    'EIC_EC',
    'IC',
    'TLK_IR',
    'ACCELERATED',
    'LOCAL',
  ];

  for (const code of carrierCodes) {
    addTop((s) => s.carrierCode === code, 45);
    addTop((s) => s.carrierCode === code && s.distanceKm >= 10, 45);
  }

  for (const grp of categoryGroups) {
    addTop((s) => s.categoryGroup === grp, 45);
    addTop((s) => s.categoryGroup === grp && s.distanceKm >= 10, 45);
  }

  for (const code of carrierCodes) {
    for (const grp of categoryGroups) {
      addTop((s) => s.carrierCode === code && s.categoryGroup === grp && s.distanceKm >= 10, 20);
    }
  }

  const segments = Array.from(selectedSegmentsMap.values()).sort(
    (a, b) => b.avgSpeedKmh - a.avgSpeedKmh || b.distanceKm - a.distanceKm,
  );

  // Top fastest full routes
  const sortedFullBySpeed = [...built].sort(
    (a, b) => b.connection.avgSpeedKmh - a.connection.avgSpeedKmh || b.connection.distanceKm - a.connection.distanceKm,
  );
  const selectedRoutesMap = new Map<string, (typeof built)[number]>();
  const addTopRoutes = (predicate: (c: LongestConnection) => boolean, limit: number) => {
    let added = 0;
    for (const item of sortedFullBySpeed) {
      if (!predicate(item.connection)) continue;
      selectedRoutesMap.set(item.connection.id, item);
      added += 1;
      if (added >= limit) break;
    }
  };

  addTopRoutes(() => true, 100);
  addTopRoutes((c) => c.distanceKm >= 10, 100);
  addTopRoutes((c) => c.distanceKm >= 50, 80);
  for (const code of carrierCodes) {
    addTopRoutes((c) => c.carrierCode === code, 30);
  }
  for (const grp of categoryGroups) {
    addTopRoutes((c) => c.categoryGroup === grp, 30);
  }

  const neededShapeIds = new Set<string>();
  for (const item of selectedRoutesMap.values()) {
    if (item.shapeId) neededShapeIds.add(item.shapeId);
  }
  const shapesMap = readShapesForIds(zip, neededShapeIds);

  const fullRoutes = Array.from(selectedRoutesMap.values())
    .map(({ connection, shapeId }) => {
      const pts = shapeId ? shapesMap.get(shapeId) : undefined;
      return pts && pts.length >= 2 ? { ...connection, shapePoints: pts } : connection;
    })
    .sort((a, b) => b.avgSpeedKmh - a.avgSpeedKmh || b.distanceKm - a.distanceKm);

  const carrierCounts = new Map<string, { name: string; count: number }>();
  for (const c of built) {
    const code = c.connection.carrierCode;
    const existing = carrierCounts.get(code);
    if (existing) {
      existing.count += 1;
    } else {
      carrierCounts.set(code, { name: c.connection.carrierName, count: 1 });
    }
  }
  const carriers: CarrierSummary[] = Array.from(carrierCounts.entries())
    .map(([code, meta]) => ({ code, name: meta.name, count: meta.count }))
    .sort((a, b) => b.count - a.count);

  const result: SpeedsResponse = {
    date,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    sourceName: 'Polish Trains GTFS (mkuran.pl)',
    feedDateRange:
      feedMeta.startDate && feedMeta.endDate
        ? { from: feedMeta.startDate, to: feedMeta.endDate }
        : null,
    totalAnalyzedRoutes: built.length,
    totalAnalyzedSegments: allSegments.length,
    segments,
    fullRoutes,
    carriers,
  };

  speedsResultsCache.set(date, { value: result, expiresAt: now + DATE_RESULT_TTL_MS });

  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    const tmpJsonPath = `${diskCachePath}.tmp`;
    await fs.promises.writeFile(tmpJsonPath, JSON.stringify(result), 'utf8');
    await fs.promises.rename(tmpJsonPath, diskCachePath);
  } catch {
    // Non-fatal
  }

  return result;
}

export async function fetchLongestSegments(
  requestedDate?: string,
  forceRefresh = false,
): Promise<LongestSegmentsResponse> {
  const date =
    requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
      ? requestedDate
      : getTodayWarsawDate();

  const now = Date.now();
  const cached = longestSegmentsResultsCache.get(date);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return { ...cached.value, fromCache: true };
  }

  const diskCachePath = path.join(CACHE_DIR, `longest-segments-v2-${date}.json`);
  if (!forceRefresh) {
    try {
      const stat = await fs.promises.stat(diskCachePath);
      if (now - stat.mtimeMs < DATE_RESULT_TTL_MS) {
        const rawJson = await fs.promises.readFile(diskCachePath, 'utf8');
        const parsed = JSON.parse(rawJson) as LongestSegmentsResponse;
        longestSegmentsResultsCache.set(date, {
          value: parsed,
          expiresAt: stat.mtimeMs + DATE_RESULT_TTL_MS,
        });
        return { ...parsed, fromCache: true };
      }
    } catch {
      // Cache miss
    }
  }

  const zip = await openZipArchive(forceRefresh);
  const { feedMeta, built } = loadActiveDayBuiltTrips(zip, date);

  const allSegments: SpeedSegmentRecord[] = [];
  for (const item of built) {
    for (const seg of item.segments) {
      allSegments.push(seg);
    }
  }
  allSegments.sort((a, b) => b.distanceKm - a.distanceKm || b.avgSpeedKmh - a.avgSpeedKmh);

  const selectedSegmentsMap = new Map<string, SpeedSegmentRecord>();
  const addTop = (predicate: (s: SpeedSegmentRecord) => boolean, limit: number) => {
    let added = 0;
    for (const s of allSegments) {
      if (!predicate(s)) continue;
      if (!selectedSegmentsMap.has(s.id)) {
        selectedSegmentsMap.set(s.id, s);
      }
      added += 1;
      if (added >= limit) break;
    }
  };

  addTop(() => true, 200);
  addTop((s) => s.isDomestic, 150);
  addTop((s) => !s.isDomestic, 80);

  const carrierCodes = Array.from(new Set(built.map((b) => b.connection.carrierCode)));
  const categoryGroups: CategoryGroup[] = [
    'EIP',
    'EIC_EC',
    'IC',
    'TLK_IR',
    'ACCELERATED',
    'LOCAL',
  ];

  for (const code of carrierCodes) {
    addTop((s) => s.carrierCode === code, 60);
  }

  for (const grp of categoryGroups) {
    addTop((s) => s.categoryGroup === grp, 80);
    addTop((s) => s.categoryGroup === grp && s.isDomestic, 60);
  }

  for (const code of carrierCodes) {
    for (const grp of categoryGroups) {
      addTop((s) => s.carrierCode === code && s.categoryGroup === grp, 25);
    }
  }

  const segments = Array.from(selectedSegmentsMap.values()).sort(
    (a, b) => b.distanceKm - a.distanceKm || b.avgSpeedKmh - a.avgSpeedKmh,
  );

  const carrierCounts = new Map<string, { name: string; count: number }>();
  for (const c of built) {
    const code = c.connection.carrierCode;
    const existing = carrierCounts.get(code);
    if (existing) {
      existing.count += 1;
    } else {
      carrierCounts.set(code, { name: c.connection.carrierName, count: 1 });
    }
  }
  const carriers: CarrierSummary[] = Array.from(carrierCounts.entries())
    .map(([code, meta]) => ({ code, name: meta.name, count: meta.count }))
    .sort((a, b) => b.count - a.count);

  const result: LongestSegmentsResponse = {
    date,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    sourceName: 'Polish Trains GTFS (mkuran.pl)',
    feedDateRange:
      feedMeta.startDate && feedMeta.endDate
        ? { from: feedMeta.startDate, to: feedMeta.endDate }
        : null,
    totalAnalyzedRoutes: built.length,
    totalAnalyzedSegments: allSegments.length,
    segments,
    carriers,
  };

  longestSegmentsResultsCache.set(date, { value: result, expiresAt: now + DATE_RESULT_TTL_MS });

  try {
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    const tmpJsonPath = `${diskCachePath}.tmp`;
    await fs.promises.writeFile(tmpJsonPath, JSON.stringify(result), 'utf8');
    await fs.promises.rename(tmpJsonPath, diskCachePath);
  } catch {
    // Non-fatal
  }

  return result;
}

export async function fetchTripDetails(tripId: string): Promise<LongestConnection> {
  const now = Date.now();
  const cached = tripDetailsCache.get(tripId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const zip = await openZipArchive(false);
  const agenciesMap = readAgencies(zip);
  const routesMap = readRoutes(zip);
  const stopsMap = readStops(zip);
  const tripsMap = readActiveRailTrips(zip, null, routesMap, tripId);

  const trip = tripsMap.get(tripId);
  if (!trip) {
    throw new GtfsServiceError(404, {
      code: 'TRIP_NOT_FOUND',
      message: `Nie znaleziono kursu ${tripId} w archiwum GTFS.`,
    });
  }

  const stopTimesMap = readStopTimesForTrips(zip, tripsMap);
  const stRows = stopTimesMap.get(tripId);
  if (!stRows) {
    throw new GtfsServiceError(404, {
      code: 'TRIP_NOT_FOUND',
      message: `Brak przystanków dla kursu ${tripId}.`,
    });
  }

  const built = buildConnectionWithSegments(trip, stRows, stopsMap, routesMap, agenciesMap);
  if (!built) {
    throw new GtfsServiceError(404, {
      code: 'TRIP_NOT_FOUND',
      message: `Nie udało się zbudować trasy dla kursu ${tripId}.`,
    });
  }

  const shapeIds = new Set<string>();
  if (built.shapeId) shapeIds.add(built.shapeId);
  const shapesMap = readShapesForIds(zip, shapeIds);
  const pts = built.shapeId ? shapesMap.get(built.shapeId) : undefined;
  const fullConnection: LongestConnection =
    pts && pts.length >= 2 ? { ...built.connection, shapePoints: pts } : built.connection;

  tripDetailsCache.set(tripId, { value: fullConnection, expiresAt: now + DATE_RESULT_TTL_MS });
  return fullConnection;
}
