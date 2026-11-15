import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, RefreshCw, Search } from 'lucide-react';
import { ConnectionsTable } from './components/ConnectionsTable';
import { PolandMap, type HighlightedMapSegment } from './components/PolandMap';
import { SpeedTable, type SpeedSegmentWithFrequency } from './components/SpeedTable';
import { StationTimeline } from './components/StationTimeline';
import type {
  ApiErrorPayload,
  CategoryGroup,
  ConnectionsResponse,
  LongestConnection,
  LongestSegmentsResponse,
  MainTab,
  SortCriterion,
  SpeedSegmentRecord,
  SpeedViewMode,
  SpeedsResponse,
} from './types/railway';
import {
  CATEGORY_GROUP_LABELS,
  formatDistanceKm,
  formatDuration,
  formatDurationSeconds,
  formatFetchedTime,
  formatSpeedKmh,
  getTodayWarsawInputValue,
} from './utils/formatters';

const MIN_DISTANCE_OPTIONS = [
  { value: 0, label: 'Bez progu' },
  { value: 5, label: '≥ 5 km' },
  { value: 10, label: '≥ 10 km' },
  { value: 25, label: '≥ 25 km' },
  { value: 50, label: '≥ 50 km' },
];

const CATEGORY_GROUP_OPTIONS: { value: CategoryGroup | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'Wszystkie kat.' },
  { value: 'EIP', label: 'EIP' },
  { value: 'EIC_EC', label: 'EIC / EC' },
  { value: 'IC', label: 'IC' },
  { value: 'TLK_IR', label: 'TLK / IR' },
  { value: 'ACCELERATED', label: 'Przyspieszone' },
  { value: 'LOCAL', label: 'Osobowe' },
];

export default function App() {
  const [mainTab, setMainTab] = useState<MainTab>('longest');
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayWarsawInputValue());

  // Shared filters
  const [scopeFilter, setScopeFilter] = useState<'all' | 'domestic' | 'international'>('all');
  const [selectedCarrier, setSelectedCarrier] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredStationId, setHoveredStationId] = useState<number | null>(null);

  // Longest Connections tab state
  const [sortBy, setSortBy] = useState<SortCriterion>('distance');
  const [data, setData] = useState<ConnectionsResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoadingLongest, setIsLoadingLongest] = useState<boolean>(true);
  const [longestError, setLongestError] = useState<ApiErrorPayload | null>(null);

  // Longest Segments tab state
  const [longestSegmentsData, setLongestSegmentsData] = useState<LongestSegmentsResponse | null>(null);
  const [selectedLongestSegmentId, setSelectedLongestSegmentId] = useState<string | null>(null);
  const [isLoadingLongestSegments, setIsLoadingLongestSegments] = useState<boolean>(false);
  const [longestSegmentsError, setLongestSegmentsError] = useState<ApiErrorPayload | null>(null);

  // Speeds tab state
  const [speedMode, setSpeedMode] = useState<SpeedViewMode>('segments');
  const [minDistanceKm, setMinDistanceKm] = useState<number>(10);
  const [selectedCategoryGroup, setSelectedCategoryGroup] = useState<CategoryGroup | 'ALL'>('ALL');
  const [uniqueSegmentsOnly, setUniqueSegmentsOnly] = useState<boolean>(false);
  const [speedsData, setSpeedsData] = useState<SpeedsResponse | null>(null);
  const [selectedSpeedSegmentId, setSelectedSpeedSegmentId] = useState<string | null>(null);
  const [selectedSpeedFullRouteId, setSelectedSpeedFullRouteId] = useState<string | null>(null);
  const [isLoadingSpeeds, setIsLoadingSpeeds] = useState<boolean>(false);
  const [speedsError, setSpeedsError] = useState<ApiErrorPayload | null>(null);

  // On-demand trip details cache for clicked segments
  const tripDetailsCacheRef = useRef<Map<string, LongestConnection>>(new Map());
  const latestTripRequestRef = useRef<string | null>(null);
  const [activeTripDetails, setActiveTripDetails] = useState<LongestConnection | null>(null);
  const [isLoadingTripDetails, setIsLoadingTripDetails] = useState<boolean>(false);

  const loadConnections = useCallback(async (date: string, refresh = false) => {
    setIsLoadingLongest(true);
    setLongestError(null);
    try {
      const params = new URLSearchParams({ date });
      if (refresh) params.set('refresh', 'true');
      const res = await fetch(`/api/longest-connections?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setLongestError(json as ApiErrorPayload);
        setData(null);
        setSelectedId(null);
        return;
      }
      const payload = json as ConnectionsResponse;
      setData(payload);
      setSelectedId((prev) => {
        if (prev && payload.connections.some((c) => c.id === prev)) return prev;
        return payload.connections[0]?.id ?? null;
      });
    } catch (err) {
      setLongestError({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Nie udało się połączyć z lokalnym serwerem proxy.',
        details: err instanceof Error ? err.message : undefined,
      });
      setData(null);
    } finally {
      setIsLoadingLongest(false);
    }
  }, []);

  const loadSpeeds = useCallback(async (date: string, refresh = false) => {
    setIsLoadingSpeeds(true);
    setSpeedsError(null);
    try {
      const params = new URLSearchParams({ date });
      if (refresh) params.set('refresh', 'true');
      const res = await fetch(`/api/fastest-segments?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setSpeedsError(json as ApiErrorPayload);
        setSpeedsData(null);
        return;
      }
      const payload = json as SpeedsResponse;
      setSpeedsData(payload);
    } catch (err) {
      setSpeedsError({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Nie udało się pobrać zestawienia średnich prędkości z serwera.',
        details: err instanceof Error ? err.message : undefined,
      });
      setSpeedsData(null);
    } finally {
      setIsLoadingSpeeds(false);
    }
  }, []);

  const loadLongestSegments = useCallback(async (date: string, refresh = false) => {
    setIsLoadingLongestSegments(true);
    setLongestSegmentsError(null);
    try {
      const params = new URLSearchParams({ date });
      if (refresh) params.set('refresh', 'true');
      const res = await fetch(`/api/longest-segments?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        setLongestSegmentsError(json as ApiErrorPayload);
        setLongestSegmentsData(null);
        return;
      }
      const payload = json as LongestSegmentsResponse;
      setLongestSegmentsData(payload);
    } catch (err) {
      setLongestSegmentsError({
        code: 'FEED_DOWNLOAD_ERROR',
        message: 'Nie udało się pobrać zestawienia najdłuższych odcinków z serwera.',
        details: err instanceof Error ? err.message : undefined,
      });
      setLongestSegmentsData(null);
    } finally {
      setIsLoadingLongestSegments(false);
    }
  }, []);

  const loadTripDetailsForSegment = useCallback(async (tripId: string) => {
    const cached = tripDetailsCacheRef.current.get(tripId);
    if (cached) {
      latestTripRequestRef.current = tripId;
      setActiveTripDetails(cached);
      setIsLoadingTripDetails(false);
      return;
    }

    latestTripRequestRef.current = tripId;
    setIsLoadingTripDetails(true);
    try {
      const res = await fetch(`/api/trip-details?tripId=${encodeURIComponent(tripId)}`);
      if (!res.ok) {
        if (latestTripRequestRef.current === tripId) {
          setActiveTripDetails(null);
        }
        return;
      }
      const trip = (await res.json()) as LongestConnection;
      tripDetailsCacheRef.current.set(tripId, trip);
      if (latestTripRequestRef.current === tripId) {
        setActiveTripDetails(trip);
      }
    } catch {
      if (latestTripRequestRef.current === tripId) {
        setActiveTripDetails(null);
      }
    } finally {
      if (latestTripRequestRef.current === tripId) {
        setIsLoadingTripDetails(false);
      }
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'longest') {
      if (!data || data.date !== selectedDate) {
        void loadConnections(selectedDate, false);
      }
    } else if (mainTab === 'longestSegments') {
      if (!longestSegmentsData || longestSegmentsData.date !== selectedDate) {
        void loadLongestSegments(selectedDate, false);
      }
    } else {
      if (!speedsData || speedsData.date !== selectedDate) {
        void loadSpeeds(selectedDate, false);
      }
    }
  }, [
    mainTab,
    selectedDate,
    data,
    longestSegmentsData,
    speedsData,
    loadConnections,
    loadLongestSegments,
    loadSpeeds,
  ]);

  const handleDateChange = (nextDate: string) => {
    if (!nextDate || nextDate === selectedDate) return;
    setSelectedDate(nextDate);
    setHoveredStationId(null);
    setActiveTripDetails(null);
  };

  const handleRefreshActive = () => {
    if (mainTab === 'longest') {
      setSpeedsData(null);
      setLongestSegmentsData(null);
      void loadConnections(selectedDate, true);
    } else if (mainTab === 'longestSegments') {
      setData(null);
      setSpeedsData(null);
      tripDetailsCacheRef.current.clear();
      setActiveTripDetails(null);
      void loadLongestSegments(selectedDate, true);
    } else {
      setData(null);
      setLongestSegmentsData(null);
      tripDetailsCacheRef.current.clear();
      setActiveTripDetails(null);
      void loadSpeeds(selectedDate, true);
    }
  };

  // Filtered & sorted Longest Connections
  const filteredAndSorted = useMemo(() => {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = data.connections.filter((conn) => {
      if (scopeFilter === 'domestic' && !conn.isDomestic) return false;
      if (scopeFilter === 'international' && conn.isDomestic) return false;
      if (selectedCarrier !== 'ALL' && conn.carrierCode !== selectedCarrier) {
        return false;
      }
      if (!q) return true;
      return (
        conn.originName.toLowerCase().includes(q) ||
        conn.destinationName.toLowerCase().includes(q) ||
        conn.trainNumber.toLowerCase().includes(q) ||
        (conn.trainName && conn.trainName.toLowerCase().includes(q)) ||
        conn.stops.some((s) => s.name.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'distance') {
        return b.distanceKm - a.distanceKm || b.durationMinutes - a.durationMinutes;
      }
      return b.durationMinutes - a.durationMinutes || b.distanceKm - a.distanceKm;
    });
  }, [data, scopeFilter, selectedCarrier, searchQuery, sortBy]);

  useEffect(() => {
    if (filteredAndSorted.length === 0) return;
    const stillVisible = filteredAndSorted.some((c) => c.id === selectedId);
    if (!stillVisible) {
      setSelectedId(filteredAndSorted[0].id);
    }
  }, [filteredAndSorted, selectedId]);

  // Filtered & sorted Speed Segments (Odcinki A -> B)
  const filteredSpeedSegments: SpeedSegmentWithFrequency[] = useMemo(() => {
    if (!speedsData) return [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = speedsData.segments.filter((seg) => {
      if (seg.distanceKm < minDistanceKm) return false;
      if (scopeFilter === 'domestic' && !seg.isDomestic) return false;
      if (scopeFilter === 'international' && seg.isDomestic) return false;
      if (selectedCarrier !== 'ALL' && seg.carrierCode !== selectedCarrier) return false;
      if (selectedCategoryGroup !== 'ALL' && seg.categoryGroup !== selectedCategoryGroup) {
        return false;
      }
      if (!q) return true;
      return (
        seg.fromStationName.toLowerCase().includes(q) ||
        seg.toStationName.toLowerCase().includes(q) ||
        seg.routeOriginName.toLowerCase().includes(q) ||
        seg.routeDestinationName.toLowerCase().includes(q) ||
        seg.trainNumber.toLowerCase().includes(q) ||
        (seg.trainName && seg.trainName.toLowerCase().includes(q))
      );
    });

    const sorted = [...filtered].sort(
      (a, b) => b.avgSpeedKmh - a.avgSpeedKmh || b.distanceKm - a.distanceKm,
    );

    if (!uniqueSegmentsOnly) {
      return sorted.slice(0, 120);
    }

    const pairMap = new Map<string, { record: SpeedSegmentRecord; count: number }>();
    for (const seg of sorted) {
      const pairKey = `${seg.fromStationId}-${seg.toStationId}`;
      const existing = pairMap.get(pairKey);
      if (!existing) {
        pairMap.set(pairKey, { record: seg, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    return Array.from(pairMap.values())
      .slice(0, 120)
      .map((entry) => ({
        ...entry.record,
        frequencyCount: entry.count,
      }));
  }, [
    speedsData,
    minDistanceKm,
    scopeFilter,
    selectedCarrier,
    selectedCategoryGroup,
    searchQuery,
    uniqueSegmentsOnly,
  ]);

  // Filtered & sorted Speed Full Routes (Całe trasy)
  const filteredSpeedFullRoutes = useMemo(() => {
    if (!speedsData) return [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = speedsData.fullRoutes.filter((conn) => {
      if (conn.distanceKm < minDistanceKm) return false;
      if (scopeFilter === 'domestic' && !conn.isDomestic) return false;
      if (scopeFilter === 'international' && conn.isDomestic) return false;
      if (selectedCarrier !== 'ALL' && conn.carrierCode !== selectedCarrier) return false;
      if (selectedCategoryGroup !== 'ALL' && conn.categoryGroup !== selectedCategoryGroup) {
        return false;
      }
      if (!q) return true;
      return (
        conn.originName.toLowerCase().includes(q) ||
        conn.destinationName.toLowerCase().includes(q) ||
        conn.trainNumber.toLowerCase().includes(q) ||
        (conn.trainName && conn.trainName.toLowerCase().includes(q)) ||
        conn.stops.some((s) => s.name.toLowerCase().includes(q))
      );
    });

    return [...filtered]
      .sort((a, b) => b.avgSpeedKmh - a.avgSpeedKmh || b.distanceKm - a.distanceKm)
      .slice(0, 120);
  }, [
    speedsData,
    minDistanceKm,
    scopeFilter,
    selectedCarrier,
    selectedCategoryGroup,
    searchQuery,
  ]);

  // Filtered & sorted Longest Segments (Odcinki A -> B wg dystansu km)
  const filteredLongestSegments: SpeedSegmentWithFrequency[] = useMemo(() => {
    if (!longestSegmentsData) return [];
    const q = searchQuery.trim().toLowerCase();

    const filtered = longestSegmentsData.segments.filter((seg) => {
      if (scopeFilter === 'domestic' && !seg.isDomestic) return false;
      if (scopeFilter === 'international' && seg.isDomestic) return false;
      if (selectedCarrier !== 'ALL' && seg.carrierCode !== selectedCarrier) return false;
      if (selectedCategoryGroup !== 'ALL' && seg.categoryGroup !== selectedCategoryGroup) {
        return false;
      }
      if (!q) return true;
      return (
        seg.fromStationName.toLowerCase().includes(q) ||
        seg.toStationName.toLowerCase().includes(q) ||
        seg.routeOriginName.toLowerCase().includes(q) ||
        seg.routeDestinationName.toLowerCase().includes(q) ||
        seg.trainNumber.toLowerCase().includes(q) ||
        (seg.trainName && seg.trainName.toLowerCase().includes(q))
      );
    });

    const sorted = [...filtered].sort(
      (a, b) => b.distanceKm - a.distanceKm || b.avgSpeedKmh - a.avgSpeedKmh,
    );

    if (!uniqueSegmentsOnly) {
      return sorted.slice(0, 120);
    }

    const pairMap = new Map<string, { record: SpeedSegmentRecord; count: number }>();
    for (const seg of sorted) {
      const pairKey = `${seg.fromStationId}-${seg.toStationId}`;
      const existing = pairMap.get(pairKey);
      if (!existing) {
        pairMap.set(pairKey, { record: seg, count: 1 });
      } else {
        existing.count += 1;
      }
    }

    return Array.from(pairMap.values())
      .slice(0, 120)
      .map((entry) => ({
        ...entry.record,
        frequencyCount: entry.count,
      }));
  }, [
    longestSegmentsData,
    scopeFilter,
    selectedCarrier,
    selectedCategoryGroup,
    searchQuery,
    uniqueSegmentsOnly,
  ]);

  const selectedLongestSegment = useMemo(() => {
    if (filteredLongestSegments.length === 0) return null;
    return (
      filteredLongestSegments.find((s) => s.id === selectedLongestSegmentId) ??
      filteredLongestSegments[0]
    );
  }, [filteredLongestSegments, selectedLongestSegmentId]);

  const selectedSpeedSegment = useMemo(() => {
    if (filteredSpeedSegments.length === 0) return null;
    return (
      filteredSpeedSegments.find((s) => s.id === selectedSpeedSegmentId) ??
      filteredSpeedSegments[0]
    );
  }, [filteredSpeedSegments, selectedSpeedSegmentId]);

  const selectedSpeedFullRoute = useMemo(() => {
    if (filteredSpeedFullRoutes.length === 0) return null;
    return (
      filteredSpeedFullRoutes.find((c) => c.id === selectedSpeedFullRouteId) ??
      filteredSpeedFullRoutes[0]
    );
  }, [filteredSpeedFullRoutes, selectedSpeedFullRouteId]);

  // Auto-sync trip details when in Speeds -> Segments mode or LongestSegments tab
  useEffect(() => {
    if (mainTab === 'speeds' && speedMode === 'segments') {
      if (!selectedSpeedSegment) {
        setActiveTripDetails(null);
        return;
      }
      if (selectedSpeedSegmentId !== selectedSpeedSegment.id) {
        setSelectedSpeedSegmentId(selectedSpeedSegment.id);
      }
      void loadTripDetailsForSegment(selectedSpeedSegment.tripId);
    } else if (mainTab === 'longestSegments') {
      if (!selectedLongestSegment) {
        setActiveTripDetails(null);
        return;
      }
      if (selectedLongestSegmentId !== selectedLongestSegment.id) {
        setSelectedLongestSegmentId(selectedLongestSegment.id);
      }
      void loadTripDetailsForSegment(selectedLongestSegment.tripId);
    }
  }, [
    mainTab,
    speedMode,
    selectedSpeedSegment,
    selectedSpeedSegmentId,
    selectedLongestSegment,
    selectedLongestSegmentId,
    loadTripDetailsForSegment,
  ]);

  useEffect(() => {
    if (mainTab !== 'speeds' || speedMode !== 'fullRoutes') return;
    if (filteredSpeedFullRoutes.length === 0) return;
    const stillVisible = filteredSpeedFullRoutes.some((c) => c.id === selectedSpeedFullRouteId);
    if (!stillVisible) {
      setSelectedSpeedFullRouteId(filteredSpeedFullRoutes[0].id);
    }
  }, [mainTab, speedMode, filteredSpeedFullRoutes, selectedSpeedFullRouteId]);

  const selectedConnection: LongestConnection | null = useMemo(() => {
    if (!selectedId) return filteredAndSorted[0] ?? null;
    return (
      filteredAndSorted.find((c) => c.id === selectedId) ??
      data?.connections.find((c) => c.id === selectedId) ??
      null
    );
  }, [selectedId, filteredAndSorted, data]);

  // Active connection & highlight passed to Map + StationTimeline
  const activeMapConnection: LongestConnection | null = useMemo(() => {
    if (mainTab === 'longest') return selectedConnection;
    if (mainTab === 'longestSegments') {
      if (
        activeTripDetails &&
        selectedLongestSegment &&
        activeTripDetails.id === selectedLongestSegment.tripId
      ) {
        return activeTripDetails;
      }
      return null;
    }
    if (speedMode === 'fullRoutes') return selectedSpeedFullRoute;
    if (activeTripDetails && selectedSpeedSegment && activeTripDetails.id === selectedSpeedSegment.tripId) {
      return activeTripDetails;
    }
    return null;
  }, [
    mainTab,
    speedMode,
    selectedConnection,
    selectedSpeedFullRoute,
    activeTripDetails,
    selectedSpeedSegment,
    selectedLongestSegment,
  ]);

  const highlightedMapSegment: HighlightedMapSegment | null = useMemo(() => {
    if (mainTab === 'longestSegments' && selectedLongestSegment) {
      return {
        fromStationId: selectedLongestSegment.fromStationId,
        toStationId: selectedLongestSegment.toStationId,
        fromName: selectedLongestSegment.fromStationName,
        toName: selectedLongestSegment.toStationName,
        fromLat: selectedLongestSegment.fromLat,
        fromLon: selectedLongestSegment.fromLon,
        toLat: selectedLongestSegment.toLat,
        toLon: selectedLongestSegment.toLon,
      };
    }
    if (mainTab !== 'speeds' || speedMode !== 'segments' || !selectedSpeedSegment) {
      return null;
    }
    return {
      fromStationId: selectedSpeedSegment.fromStationId,
      toStationId: selectedSpeedSegment.toStationId,
      fromName: selectedSpeedSegment.fromStationName,
      toName: selectedSpeedSegment.toStationName,
      fromLat: selectedSpeedSegment.fromLat,
      fromLon: selectedSpeedSegment.fromLon,
      toLat: selectedSpeedSegment.toLat,
      toLon: selectedSpeedSegment.toLon,
    };
  }, [mainTab, speedMode, selectedSpeedSegment, selectedLongestSegment]);

  // KPI metrics for Longest tab
  const topDistanceRecord = useMemo(() => {
    const source = filteredAndSorted.length > 0 ? filteredAndSorted : data?.connections ?? [];
    if (source.length === 0) return null;
    return [...source].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  }, [filteredAndSorted, data]);

  const topDurationRecord = useMemo(() => {
    const source = filteredAndSorted.length > 0 ? filteredAndSorted : data?.connections ?? [];
    if (source.length === 0) return null;
    return [...source].sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
  }, [filteredAndSorted, data]);

  // KPI metrics for Speeds tab
  const topSpeedRecord = useMemo(() => {
    if (speedMode === 'segments') {
      return filteredSpeedSegments[0] ?? null;
    }
    return filteredSpeedFullRoutes[0] ?? null;
  }, [speedMode, filteredSpeedSegments, filteredSpeedFullRoutes]);

  const topLongestSegmentRecord = filteredLongestSegments[0] ?? null;

  const activeError =
    mainTab === 'longest'
      ? longestError
      : mainTab === 'longestSegments'
        ? longestSegmentsError
        : speedsError;
  const activeLoading =
    mainTab === 'longest'
      ? isLoadingLongest
      : mainTab === 'longestSegments'
        ? isLoadingLongestSegments
        : isLoadingSpeeds;
  const activeCarriers =
    mainTab === 'longest'
      ? data?.carriers ?? []
      : mainTab === 'longestSegments'
        ? longestSegmentsData?.carriers ?? []
        : speedsData?.carriers ?? [];

  const handleResetFilters = () => {
    setScopeFilter('all');
    setSelectedCarrier('ALL');
    setSearchQuery('');
    if (mainTab === 'speeds' || mainTab === 'longestSegments') {
      setSelectedCategoryGroup('ALL');
      setUniqueSegmentsOnly(false);
    }
    if (mainTab === 'speeds') {
      setMinDistanceKm(10);
    }
  };

  return (
    <div className="min-h-screen bg-[#090D16] text-slate-100 flex flex-col">
      {/* Top Bar Contract: 3 zones, gap-8, single-line controls */}
      <header className="border-b border-white/[0.08] bg-[#0B101B] sticky top-0 z-30">
        <div className="max-w-[1760px] mx-auto px-4 lg:px-5 py-3.5 flex items-center justify-between gap-8">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="font-display text-lg font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            PKP · Analiza Rozkładów GTFS
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => {
                setMainTab('longest');
                setHoveredStationId(null);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mainTab === 'longest' ? 'text-amber-400 font-semibold' : 'hover:text-amber-400'
              }`}
            >
              Najdłuższe trasy
            </button>
            <button
              type="button"
              onClick={() => {
                setMainTab('longestSegments');
                setHoveredStationId(null);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mainTab === 'longestSegments'
                  ? 'text-amber-400 font-semibold'
                  : 'hover:text-amber-400'
              }`}
            >
              Najdłuższe odcinki
            </button>
            <button
              type="button"
              onClick={() => {
                setMainTab('speeds');
                setHoveredStationId(null);
              }}
              className={`transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                mainTab === 'speeds' ? 'text-cyan-400 font-semibold' : 'hover:text-cyan-400'
              }`}
            >
              Średnie prędkości
            </button>
            <a
              href="#mapa-trasy"
              className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Mapa i oś
            </a>
            <a
              href="#metodologia"
              className="hover:text-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Metodologia
            </a>
          </nav>

          <button
            type="button"
            disabled={activeLoading}
            onClick={handleRefreshActive}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-amber-500 text-slate-950 hover:bg-amber-400 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${activeLoading ? 'animate-spin' : ''}`} />
            Odśwież dane
          </button>
        </div>
      </header>

      <main id="top" className="flex-1 max-w-[1760px] w-full mx-auto px-4 lg:px-5 py-6 space-y-6">
        {/* Hero Title & Primary Tab Switcher */}
        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex flex-wrap items-center gap-1 p-1 bg-[#111827] border border-white/10 rounded">
                <button
                  type="button"
                  onClick={() => {
                    setMainTab('longest');
                    setHoveredStationId(null);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mainTab === 'longest'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Najdłuższe trasy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMainTab('longestSegments');
                    setHoveredStationId(null);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mainTab === 'longestSegments'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Najdłuższe odcinki (km)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMainTab('speeds');
                    setHoveredStationId(null);
                  }}
                  className={`px-3.5 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    mainTab === 'speeds'
                      ? 'bg-cyan-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  Średnie prędkości (km/h)
                </button>
              </div>

              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 text-balance">
                {mainTab === 'longest'
                  ? 'Zestawienie najdłuższych połączeń kolejowych w Polsce'
                  : mainTab === 'longestSegments'
                    ? 'Najdłuższe odcinki bez postoju między stacjami (km)'
                    : 'Najszybsze odcinki i trasy kolejowe w Polsce (km/h)'}
              </h1>
              <p className="text-sm text-slate-400">
                {mainTab === 'longest'
                  ? 'Dane rozkładowe ze zbioru Polish Trains GTFS · dystans po śladzie torowym oraz współrzędne stacji WGS84'
                  : mainTab === 'longestSegments'
                    ? 'Zestawienie najdłuższych nieprzerwanych przelotów między kolejnymi postojami handlowymi dla wszystkich kategorii pociągów'
                    : 'Prędkość handlowa wyliczana z dokładnością do sekund na bazie rzeczywistej długości torowej odcinków z GTFS'}
              </p>
            </div>

            {mainTab === 'longest' && data && (
              <div className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                Przetworzono {formatFetchedTime(data.fetchedAt)} ·{' '}
                {data.fromCache ? 'pamięć podręczna' : 'świeży odczyt GTFS'}
                {data.feedDateRange
                  ? ` · zakres ${data.feedDateRange.from} – ${data.feedDateRange.to}`
                  : ''}
              </div>
            )}

            {mainTab === 'longestSegments' && longestSegmentsData && (
              <div className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                Przetworzono {formatFetchedTime(longestSegmentsData.fetchedAt)} ·{' '}
                {longestSegmentsData.fromCache ? 'pamięć podręczna' : 'świeży odczyt GTFS'}
                {longestSegmentsData.feedDateRange
                  ? ` · zakres ${longestSegmentsData.feedDateRange.from} – ${longestSegmentsData.feedDateRange.to}`
                  : ''}
              </div>
            )}

            {mainTab === 'speeds' && speedsData && (
              <div className="text-xs text-slate-400 font-mono tabular-nums shrink-0">
                Przetworzono {formatFetchedTime(speedsData.fetchedAt)} ·{' '}
                {speedsData.fromCache ? 'pamięć podręczna' : 'świeży odczyt GTFS'}
                {speedsData.feedDateRange
                  ? ` · zakres ${speedsData.feedDateRange.from} – ${speedsData.feedDateRange.to}`
                  : ''}
              </div>
            )}
          </div>

          {/* 4-column KPI strip */}
          {mainTab === 'longest' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-white/[0.08] bg-[#111827] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
              <div className="p-4">
                <div className="text-xs text-slate-400">Najdłuższa trasa (km)</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-amber-400">
                  {topDistanceRecord ? formatDistanceKm(topDistanceRecord.distanceKm) : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topDistanceRecord
                    ? `${topDistanceRecord.originName} → ${topDistanceRecord.destinationName}`
                    : 'Ładowanie rozkładu GTFS'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Najdłuższy czas jazdy</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {topDurationRecord ? formatDuration(topDurationRecord.durationMinutes) : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topDurationRecord
                    ? `${topDurationRecord.originName} → ${topDurationRecord.destinationName}`
                    : 'Ładowanie rozkładu GTFS'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Przeanalizowane kursy</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {data ? data.totalAnalyzedRoutes.toLocaleString('pl-PL') : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {data
                    ? `Wszystkie pociągi w Polsce (${data.carriers.length} przewoźników w TOP)`
                    : 'Rozkład planowy na wybrany dzień'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Wybrany pociąg (start → koniec)</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {selectedConnection
                    ? `${selectedConnection.startTime} → ${selectedConnection.endTime}${
                        selectedConnection.endDayOffset > 0
                          ? ` (+${selectedConnection.endDayOffset}d)`
                          : ''
                      }`
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {selectedConnection
                    ? `${selectedConnection.categorySymbol} ${selectedConnection.trainNumber} · ${selectedConnection.stopsCount} stacji`
                    : 'Wybierz wiersz z tabeli poniżej'}
                </div>
              </div>
            </div>
          ) : mainTab === 'longestSegments' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-white/[0.08] bg-[#111827] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
              <div className="p-4">
                <div className="text-xs text-slate-400">Najdłuższy odcinek A → B</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-amber-400">
                  {topLongestSegmentRecord
                    ? formatDistanceKm(topLongestSegmentRecord.distanceKm)
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topLongestSegmentRecord
                    ? `${topLongestSegmentRecord.fromStationName} → ${topLongestSegmentRecord.toStationName}`
                    : 'Brak danych dla wybranych filtrów'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Czas i prędkość rekordu</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {topLongestSegmentRecord
                    ? `${formatDurationSeconds(topLongestSegmentRecord.durationSeconds)} · ${formatSpeedKmh(topLongestSegmentRecord.avgSpeedKmh)}`
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topLongestSegmentRecord
                    ? `${topLongestSegmentRecord.categorySymbol} ${topLongestSegmentRecord.trainNumber} (${topLongestSegmentRecord.carrierCode})`
                    : 'Wszystkie kategorie pociągów'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Przeanalizowane odcinki / kursy</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {longestSegmentsData
                    ? `${longestSegmentsData.totalAnalyzedSegments.toLocaleString('pl-PL')} / ${longestSegmentsData.totalAnalyzedRoutes.toLocaleString('pl-PL')}`
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {longestSegmentsData
                    ? `Widoczne: ${filteredLongestSegments.length} pozycji (${CATEGORY_GROUP_OPTIONS.find((o) => o.value === selectedCategoryGroup)?.label ?? ''})`
                    : 'Ładowanie rozkładu GTFS'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Wybrany odcinek A → B</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {selectedLongestSegment
                    ? formatDistanceKm(selectedLongestSegment.distanceKm)
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {selectedLongestSegment
                    ? `${selectedLongestSegment.fromStationName} → ${selectedLongestSegment.toStationName} (${selectedLongestSegment.departureTime}–${selectedLongestSegment.arrivalTime})`
                    : 'Wybierz wiersz z tabeli poniżej'}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-white/[0.08] bg-[#111827] rounded-lg divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
              <div className="p-4">
                <div className="text-xs text-slate-400">
                  {speedMode === 'segments'
                    ? 'Rekord prędkości (odcinek)'
                    : 'Rekord prędkości (cała trasa)'}
                </div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-cyan-400">
                  {topSpeedRecord ? formatSpeedKmh(topSpeedRecord.avgSpeedKmh) : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topSpeedRecord
                    ? 'fromStationName' in topSpeedRecord
                      ? `${topSpeedRecord.fromStationName} → ${topSpeedRecord.toStationName}`
                      : `${topSpeedRecord.originName} → ${topSpeedRecord.destinationName}`
                    : 'Brak danych dla wybranych filtrów'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Dystans i czas rekordu</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {topSpeedRecord
                    ? `${formatDistanceKm(topSpeedRecord.distanceKm)} · ${formatDurationSeconds(topSpeedRecord.durationSeconds)}`
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {topSpeedRecord
                    ? `${topSpeedRecord.categorySymbol} ${topSpeedRecord.trainNumber} (${topSpeedRecord.carrierCode})`
                    : `Próg minimalny: ${minDistanceKm} km`}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">Przeanalizowane odcinki / kursy</div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {speedsData
                    ? `${speedsData.totalAnalyzedSegments.toLocaleString('pl-PL')} / ${speedsData.totalAnalyzedRoutes.toLocaleString('pl-PL')}`
                    : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {speedsData
                    ? `Widoczne: ${
                        speedMode === 'segments'
                          ? filteredSpeedSegments.length
                          : filteredSpeedFullRoutes.length
                      } pozycji (${CATEGORY_GROUP_OPTIONS.find((o) => o.value === selectedCategoryGroup)?.label ?? ''})`
                    : 'Obliczanie prędkości między postojami'}
                </div>
              </div>

              <div className="p-4">
                <div className="text-xs text-slate-400">
                  {speedMode === 'segments' ? 'Wybrany odcinek A → B' : 'Wybrany pociąg'}
                </div>
                <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-100">
                  {speedMode === 'segments' && selectedSpeedSegment
                    ? `${formatSpeedKmh(selectedSpeedSegment.avgSpeedKmh)}`
                    : speedMode === 'fullRoutes' && selectedSpeedFullRoute
                      ? `${formatSpeedKmh(selectedSpeedFullRoute.avgSpeedKmh)}`
                      : '—'}
                </div>
                <div className="text-xs text-slate-400 mt-1 truncate">
                  {speedMode === 'segments' && selectedSpeedSegment
                    ? `${selectedSpeedSegment.fromStationName} → ${selectedSpeedSegment.toStationName} (${selectedSpeedSegment.departureTime}–${selectedSpeedSegment.arrivalTime})`
                    : speedMode === 'fullRoutes' && selectedSpeedFullRoute
                      ? `${selectedSpeedFullRoute.originName} → ${selectedSpeedFullRoute.destinationName}`
                      : 'Wybierz wiersz z tabeli poniżej'}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Controls Bar */}
        <section className="bg-[#111827] border border-white/[0.08] rounded-lg p-3 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Primary Mode Switcher per active tab */}
              {mainTab === 'longest' ? (
                <div className="flex items-center p-1 bg-[#090D16] border border-white/10 rounded">
                  <button
                    type="button"
                    onClick={() => setSortBy('distance')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sortBy === 'distance'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Dystans (km)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSortBy('duration')}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      sortBy === 'duration'
                        ? 'bg-amber-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Czas przejazdu
                  </button>
                </div>
              ) : mainTab === 'speeds' ? (
                <div className="flex items-center p-1 bg-[#090D16] border border-white/10 rounded">
                  <button
                    type="button"
                    onClick={() => {
                      setSpeedMode('segments');
                      setHoveredStationId(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      speedMode === 'segments'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Odcinki A → B
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSpeedMode('fullRoutes');
                      setHoveredStationId(null);
                    }}
                    className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      speedMode === 'fullRoutes'
                        ? 'bg-cyan-400 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Całe trasy
                  </button>
                </div>
              ) : null}

              {/* Min distance selector (Speeds tab) */}
              {mainTab === 'speeds' && (
                <div className="flex items-center p-1 bg-[#090D16] border border-white/10 rounded">
                  <span className="px-2 text-[11px] text-slate-500 whitespace-nowrap">
                    Próg:
                  </span>
                  {MIN_DISTANCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMinDistanceKm(opt.value)}
                      className={`px-2 py-1.5 text-xs font-mono tabular-nums rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        minDistanceKm === opt.value
                          ? 'bg-slate-800 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Scope Filter (All / Domestic PL / International) */}
              <div className="flex items-center p-1 bg-[#090D16] border border-white/10 rounded">
                <button
                  type="button"
                  onClick={() => setScopeFilter('all')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    scopeFilter === 'all'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Wszystkie
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('domestic')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    scopeFilter === 'domestic'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Krajowe (PL)
                </button>
                <button
                  type="button"
                  onClick={() => setScopeFilter('international')}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    scopeFilter === 'international'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Międzynarodowe
                </button>
              </div>

              {/* Date Picker */}
              <label className="inline-flex items-center gap-2 px-3 py-1.5 bg-[#090D16] border border-white/10 rounded text-xs text-slate-300">
                <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">Data:</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => handleDateChange(e.target.value)}
                  className="bg-transparent font-mono tabular-nums text-slate-100 focus:outline-none cursor-pointer"
                />
              </label>
            </div>

            {/* Search box */}
            <div className="relative w-full lg:w-72 shrink-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Szukaj stacji, nazwy lub numeru..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-[#090D16] border border-white/10 rounded text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-500/60"
              />
            </div>
          </div>

          {/* Second Filter Row: Carrier tabs & (for Speeds) Category Group + Unique Segments toggle */}
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-white/[0.06]">
            {activeCarriers.length > 0 && (() => {
              const priorityCodes = ['KS', 'KM', 'IC', 'PR', 'KD'];
              const priorityCarriers = priorityCodes
                .map((code) => activeCarriers.find((c) => c.code === code))
                .filter((c): c is NonNullable<typeof c> => Boolean(c));
              const otherCarriers = activeCarriers.filter((c) => !priorityCodes.includes(c.code));
              const isOtherSelected = otherCarriers.some((c) => c.code === selectedCarrier);

              const displayLabel = (code: string, name: string) => {
                if (code === 'KS') return 'Koleje Śląskie';
                if (code === 'KM') return 'Koleje Mazowieckie';
                if (code === 'IC') return 'PKP Intercity';
                if (code === 'PR') return 'PolRegio';
                if (code === 'KD') return 'Koleje Dolnośląskie';
                return name;
              };

              return (
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#090D16] border border-white/10 rounded">
                  <button
                    type="button"
                    onClick={() => setSelectedCarrier('ALL')}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      selectedCarrier === 'ALL'
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Wszyscy
                  </button>
                  {priorityCarriers.map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setSelectedCarrier(c.code)}
                      title={c.name}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCarrier === c.code
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white'
                      }`}
                    >
                      {displayLabel(c.code, c.name)}
                    </button>
                  ))}
                  {otherCarriers.length > 0 && (
                    <select
                      aria-label="Inni przewoźnicy"
                      value={isOtherSelected ? selectedCarrier : ''}
                      onChange={(e) => {
                        if (e.target.value) setSelectedCarrier(e.target.value);
                      }}
                      className={`px-2.5 py-1.5 text-xs rounded bg-[#0B101B] border border-white/10 focus:outline-none cursor-pointer ${
                        isOtherSelected ? 'text-amber-300 border-amber-500/40' : 'text-slate-300'
                      }`}
                    >
                      <option value="" disabled>
                        Inni ({otherCarriers.length})...
                      </option>
                      {otherCarriers.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.name} ({c.code})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })()}

            {(mainTab === 'speeds' || mainTab === 'longestSegments') && (
              <>
                <div className="flex flex-wrap items-center gap-1 p-1 bg-[#090D16] border border-white/10 rounded">
                  {CATEGORY_GROUP_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      title={
                        opt.value === 'ALL'
                          ? 'Wszystkie kategorie pociągów'
                          : CATEGORY_GROUP_LABELS[opt.value]
                      }
                      onClick={() => setSelectedCategoryGroup(opt.value)}
                      className={`px-2.5 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        selectedCategoryGroup === opt.value
                          ? mainTab === 'longestSegments'
                            ? 'bg-slate-800 text-amber-300 font-semibold'
                            : 'bg-slate-800 text-cyan-300 font-semibold'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {(mainTab === 'longestSegments' || speedMode === 'segments') && (
                  <button
                    type="button"
                    onClick={() => setUniqueSegmentsOnly((prev) => !prev)}
                    className={`px-3 py-2 text-xs font-medium rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      uniqueSegmentsOnly
                        ? mainTab === 'longestSegments'
                          ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                          : 'bg-cyan-500/15 border-cyan-400/50 text-cyan-300'
                        : 'bg-[#090D16] border-white/10 text-slate-300 hover:text-white'
                    }`}
                  >
                    {uniqueSegmentsOnly ? '✓ Unikalne odcinki A → B' : 'Unikalne odcinki A → B'}
                  </button>
                )}
              </>
            )}
          </div>
        </section>

        {/* Error Diagnostic Banner */}
        {activeError && (
          <section className="bg-[#111827] border border-rose-500/40 rounded-lg p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-semibold text-rose-200">{activeError.message}</h2>
                {activeError.details && (
                  <p className="text-sm text-slate-300 mt-1 max-w-2xl">{activeError.details}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefreshActive}
              className="px-4 py-2 text-xs font-semibold rounded bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer self-start sm:self-center"
            >
              Spróbuj ponownie
            </button>
          </section>
        )}

        {/* Main Split Workspace: Table + (Map & Station Timeline) */}
        {!activeError && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 xl:gap-5 items-start">
            <div className="xl:col-span-8 min-w-0">
              {mainTab === 'longest' ? (
                <ConnectionsTable
                  connections={filteredAndSorted}
                  selectedId={selectedConnection?.id ?? null}
                  onSelect={(conn) => {
                    setSelectedId(conn.id);
                    setHoveredStationId(null);
                  }}
                  sortBy={sortBy}
                  isLoading={isLoadingLongest}
                  onResetFilters={handleResetFilters}
                />
              ) : mainTab === 'longestSegments' ? (
                <SpeedTable
                  mode="segments"
                  sortCriterion="distance"
                  segments={filteredLongestSegments}
                  fullRoutes={[]}
                  selectedSegmentId={selectedLongestSegment?.id ?? null}
                  selectedFullRouteId={null}
                  onSelectSegment={(seg) => {
                    setSelectedLongestSegmentId(seg.id);
                    setHoveredStationId(null);
                    void loadTripDetailsForSegment(seg.tripId);
                  }}
                  onSelectFullRoute={() => {}}
                  isLoading={isLoadingLongestSegments}
                  uniqueOnly={uniqueSegmentsOnly}
                  minDistanceKm={0}
                  onResetFilters={handleResetFilters}
                />
              ) : (
                <SpeedTable
                  mode={speedMode}
                  sortCriterion="speed"
                  segments={filteredSpeedSegments}
                  fullRoutes={filteredSpeedFullRoutes}
                  selectedSegmentId={selectedSpeedSegment?.id ?? null}
                  selectedFullRouteId={selectedSpeedFullRoute?.id ?? null}
                  onSelectSegment={(seg) => {
                    setSelectedSpeedSegmentId(seg.id);
                    setHoveredStationId(null);
                    void loadTripDetailsForSegment(seg.tripId);
                  }}
                  onSelectFullRoute={(conn) => {
                    setSelectedSpeedFullRouteId(conn.id);
                    setHoveredStationId(null);
                  }}
                  isLoading={isLoadingSpeeds}
                  uniqueOnly={uniqueSegmentsOnly}
                  minDistanceKm={minDistanceKm}
                  onResetFilters={handleResetFilters}
                />
              )}
            </div>

            <div className="xl:col-span-4 space-y-5 xl:sticky xl:top-20 min-w-0">
              <PolandMap
                connection={activeMapConnection}
                hoveredStationId={hoveredStationId}
                onHoverStation={setHoveredStationId}
                isLoading={
                  activeLoading ||
                  ((mainTab === 'longestSegments' || (mainTab === 'speeds' && speedMode === 'segments')) &&
                    isLoadingTripDetails &&
                    !activeMapConnection)
                }
                highlightedSegment={highlightedMapSegment}
              />

              <StationTimeline
                connection={activeMapConnection}
                hoveredStationId={hoveredStationId}
                onHoverStation={setHoveredStationId}
                isLoading={
                  activeLoading ||
                  ((mainTab === 'longestSegments' || (mainTab === 'speeds' && speedMode === 'segments')) &&
                    isLoadingTripDetails)
                }
                highlightedSegment={
                  highlightedMapSegment
                    ? {
                        fromStationId: highlightedMapSegment.fromStationId,
                        toStationId: highlightedMapSegment.toStationId,
                      }
                    : null
                }
              />
            </div>
          </div>
        )}

        {/* Methodology Section */}
        <section
          id="metodologia"
          className="border-t border-white/[0.08] pt-6 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-400 leading-relaxed"
        >
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1.5">
              Źródło danych Polish Trains GTFS
            </h3>
            <p>
              Aplikacja pobiera pełny, ogólnodostępny zbiór rozkładów kolejowych w Polsce w
              standardzie GTFS (mkuran.pl/gtfs/polish_trains.zip), scalający dane PKP PLK i
              przewoźników (PKP Intercity, Polregio, Koleje Mazowieckie, Dolnośląskie, Śląskie i
              innych) bez konieczności używania klucza API.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1.5">
              Dystans po śladzie torowym i prędkość handlowa
            </h3>
            <p>
              Odległość każdej relacji i odcinka A → B odczytywana jest ze śladu geometrycznego
              torów (shape_dist_traveled w km). Średnia prędkość handlowa liczona jest z
              dokładnością do sekund rozkładowych z odrzuceniem zniekształceń na bardzo krótkich
              odcinkach dzięki regulowanemu progowi dystansu (domyślnie ≥ 10 km).
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1.5">
              Lokalna pamięć podręczna (24h)
            </h3>
            <p>
              Zarówno pobrane archiwum GTFS, jak i przetworzone zestawienia dzienne są zapisywane
              lokalnie na dysku serwera na 24 godziny, aby nie obciążać serwisu źródłowego przy
              kolejnych zapytaniach ani po restarcie serwera. Połączenia ZKA są odfiltrowywane.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
