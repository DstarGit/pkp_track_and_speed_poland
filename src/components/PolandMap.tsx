import React, { useMemo, useRef, useState } from 'react';
import { LocateFixed, Maximize2, Minus, Plus } from 'lucide-react';
import type { LongestConnection, RouteStop } from '../types/railway';
import { formatDistanceKm } from '../utils/formatters';

export interface HighlightedMapSegment {
  fromStationId: number;
  toStationId: number;
  fromName: string;
  toName: string;
  fromLat: number | null;
  fromLon: number | null;
  toLat: number | null;
  toLon: number | null;
}

interface PolandMapProps {
  connection: LongestConnection | null;
  hoveredStationId: number | null;
  onHoverStation: (stationId: number | null) => void;
  isLoading: boolean;
  highlightedSegment?: HighlightedMapSegment | null;
}

// Accurate WGS84 [lat, lon] contour of Poland's border (clockwise from Świnoujście)
const POLAND_BORDER_WGS84: [number, number][] = [
  [53.92, 14.23], // Świnoujście
  [54.18, 15.57], // Kołobrzeg
  [54.56, 16.86], // Ustka
  [54.83, 18.31], // Rozewie / Władysławowo
  [54.60, 18.80], // Hel
  [54.38, 18.67], // Gdańsk
  [54.45, 19.64], // Krynica Morska / Zalew Wiślany
  [54.36, 20.62], // Bartoszyce / Bezledy
  [54.35, 22.79], // Wisztyniec (trójstyk PL-LT-RU)
  [54.05, 23.48], // Sejny
  [53.62, 23.62], // Kuźnica
  [53.15, 23.92], // Bobrowniki
  [52.70, 23.95], // Białowieża
  [52.26, 23.18], // Janów Podlaski
  [52.07, 23.63], // Terespol
  [51.50, 23.62], // Włodawa
  [51.14, 23.81], // Dorohusk
  [50.81, 24.15], // Hrubieszów / Zosin
  [50.45, 24.08], // Dołhobyczów
  [50.12, 23.46], // Horyniec
  [49.80, 22.97], // Medyka
  [49.45, 22.86], // Ustrzyki Dolne
  [49.00, 22.85], // Bieszczady / Opołonek
  [49.18, 22.10], // Łupków
  [49.41, 21.15], // Konieczna
  [49.35, 20.68], // Muszyna
  [49.17, 20.08], // Tatry / Rysy
  [49.25, 19.77], // Chochołów
  [49.41, 19.04], // Zwardoń
  [49.75, 18.63], // Cieszyn
  [49.94, 18.32], // Chałupki
  [50.09, 17.70], // Głubczyce
  [50.25, 17.37], // Głuchołazy
  [50.10, 16.65], // Międzylesie
  [50.44, 16.24], // Kudowa-Zdrój
  [50.76, 15.74], // Śnieżka
  [50.85, 15.32], // Jakuszyce
  [50.87, 14.82], // Bogatynia
  [51.15, 15.00], // Zgorzelec
  [51.55, 14.74], // Łęknica
  [51.95, 14.72], // Gubin
  [52.35, 14.55], // Słubice
  [52.58, 14.62], // Kostrzyn
  [52.84, 14.12], // Cedynia
  [53.26, 14.37], // Gryfino
  [53.43, 14.42], // Szczecin zachód
  [53.68, 14.28], // Nowe Warpno
  [53.92, 14.23], // Zamknięcie Świnoujście
];

const REFERENCE_CITIES: { name: string; lat: number; lon: number }[] = [
  { name: 'Warszawa', lat: 52.2297, lon: 21.0122 },
  { name: 'Kraków', lat: 50.0647, lon: 19.945 },
  { name: 'Gdańsk', lat: 54.352, lon: 18.6466 },
  { name: 'Wrocław', lat: 51.1079, lon: 17.0385 },
  { name: 'Poznań', lat: 52.4064, lon: 16.9252 },
  { name: 'Szczecin', lat: 53.4285, lon: 14.5528 },
  { name: 'Białystok', lat: 53.1325, lon: 23.1688 },
  { name: 'Lublin', lat: 51.2465, lon: 22.5684 },
  { name: 'Przemyśl', lat: 49.7839, lon: 22.7678 },
  { name: 'Katowice', lat: 50.2649, lon: 19.0238 },
];

const SVG_W = 540;
const SVG_H = 490;
const MIN_LAT = 48.75;
const MAX_LAT = 55.05;
const MIN_LON = 13.85;
const MAX_LON = 24.45;
const COS_MID = Math.cos((52 * Math.PI) / 180);

function projectWgs84(lat: number, lon: number): { x: number; y: number } {
  const lonSpan = (MAX_LON - MIN_LON) * COS_MID;
  const latSpan = MAX_LAT - MIN_LAT;
  const pad = 22;
  const usableW = SVG_W - pad * 2;
  const usableH = SVG_H - pad * 2;
  const scale = Math.min(usableW / lonSpan, usableH / latSpan);

  const mapW = lonSpan * scale;
  const mapH = latSpan * scale;
  const offsetX = (SVG_W - mapW) / 2;
  const offsetY = (SVG_H - mapH) / 2;

  const x = offsetX + (lon - MIN_LON) * COS_MID * scale;
  const y = offsetY + (MAX_LAT - lat) * scale;
  return { x, y };
}

export const PolandMap: React.FC<PolandMapProps> = ({
  connection,
  hoveredStationId,
  onHoverStation,
  isLoading,
  highlightedSegment = null,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  const borderPath = useMemo(() => {
    return (
      POLAND_BORDER_WGS84.map(([lat, lon], idx) => {
        const pt = projectWgs84(lat, lon);
        return `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
      }).join(' ') + ' Z'
    );
  }, []);

  const graticuleLines = useMemo(() => {
    const lats = [50, 51, 52, 53, 54];
    const lons = [15, 17, 19, 21, 23];
    const hLines = lats.map((lat) => {
      const p1 = projectWgs84(lat, MIN_LON);
      const p2 = projectWgs84(lat, MAX_LON);
      return { y: p1.y, x1: p1.x, x2: p2.x, label: `${lat}°N` };
    });
    const vLines = lons.map((lon) => {
      const p1 = projectWgs84(MAX_LAT, lon);
      const p2 = projectWgs84(MIN_LAT, lon);
      return { x: p1.x, y1: p1.y, y2: p2.y, label: `${lon}°E` };
    });
    return { hLines, vLines };
  }, []);

  const projectedStops = useMemo(() => {
    if (!connection) return [];
    return connection.stops
      .filter((s) => s.latitude !== null && s.longitude !== null)
      .map((s) => ({
        stop: s,
        ...projectWgs84(s.latitude as number, s.longitude as number),
      }));
  }, [connection]);

  const routePolyline = useMemo(() => {
    if (connection?.shapePoints && connection.shapePoints.length >= 2) {
      return connection.shapePoints
        .map(([lat, lon]) => {
          const pt = projectWgs84(lat, lon);
          return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
        })
        .join(' ');
    }
    if (projectedStops.length < 2) return '';
    return projectedStops.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  }, [connection, projectedStops]);

  const highlightedSegmentPolyline = useMemo(() => {
    if (!highlightedSegment) return '';

    if (connection && connection.stops.length >= 2) {
      const fromIdx = connection.stops.findIndex(
        (s) => s.stationId === highlightedSegment.fromStationId,
      );
      const toIdx =
        fromIdx >= 0
          ? connection.stops.findIndex(
              (s, idx) => idx > fromIdx && s.stationId === highlightedSegment.toStationId,
            )
          : -1;

      if (fromIdx >= 0 && toIdx > fromIdx) {
        const fromStop = connection.stops[fromIdx];
        const toStop = connection.stops[toIdx];

        if (
          connection.shapePoints &&
          connection.shapePoints.length >= 2 &&
          fromStop.latitude !== null &&
          fromStop.longitude !== null &&
          toStop.latitude !== null &&
          toStop.longitude !== null
        ) {
          const findNearestIdx = (lat: number, lon: number, startFrom: number) => {
            let bestIdx = startFrom;
            let bestDist = Infinity;
            for (let i = startFrom; i < connection.shapePoints!.length; i++) {
              const [sLat, sLon] = connection.shapePoints![i];
              const d = (sLat - lat) ** 2 + (sLon - lon) ** 2;
              if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
              }
            }
            return bestIdx;
          };

          const startShapeIdx = findNearestIdx(fromStop.latitude, fromStop.longitude, 0);
          const endShapeIdx = findNearestIdx(toStop.latitude, toStop.longitude, startShapeIdx);

          if (endShapeIdx > startShapeIdx) {
            return connection.shapePoints
              .slice(startShapeIdx, endShapeIdx + 1)
              .map(([lat, lon]) => {
                const pt = projectWgs84(lat, lon);
                return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
              })
              .join(' ');
          }
        }

        const slicePts = connection.stops
          .slice(fromIdx, toIdx + 1)
          .filter((s) => s.latitude !== null && s.longitude !== null)
          .map((s) => projectWgs84(s.latitude as number, s.longitude as number));
        if (slicePts.length >= 2) {
          return slicePts.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(' ');
        }
      }
    }

    if (
      highlightedSegment.fromLat !== null &&
      highlightedSegment.fromLon !== null &&
      highlightedSegment.toLat !== null &&
      highlightedSegment.toLon !== null
    ) {
      const p1 = projectWgs84(highlightedSegment.fromLat, highlightedSegment.fromLon);
      const p2 = projectWgs84(highlightedSegment.toLat, highlightedSegment.toLon);
      return `${p1.x.toFixed(1)},${p1.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }

    return '';
  }, [connection, highlightedSegment]);

  const activeStop: RouteStop | null = useMemo(() => {
    if (!connection || hoveredStationId === null) return null;
    return connection.stops.find((s) => s.stationId === hoveredStationId) ?? null;
  }, [connection, hoveredStationId]);

  const autoFitTransform = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (const p of projectedStops) {
      pts.push({ x: p.x, y: p.y });
    }
    if (connection?.shapePoints) {
      for (const [lat, lon] of connection.shapePoints) {
        pts.push(projectWgs84(lat, lon));
      }
    }
    if (highlightedSegment) {
      if (highlightedSegment.fromLat !== null && highlightedSegment.fromLon !== null) {
        pts.push(projectWgs84(highlightedSegment.fromLat, highlightedSegment.fromLon));
      }
      if (highlightedSegment.toLat !== null && highlightedSegment.toLon !== null) {
        pts.push(projectWgs84(highlightedSegment.toLat, highlightedSegment.toLon));
      }
    }
    if (pts.length === 0) return { scale: 1, tx: 0, ty: 0 };

    let minX = 0;
    let maxX = SVG_W;
    let minY = 0;
    let maxY = SVG_H;

    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    // If all points lie inside the default Poland frame, keep 1:1 framing
    if (minX >= 0 && maxX <= SVG_W && minY >= 0 && maxY <= SVG_H) {
      return { scale: 1, tx: 0, ty: 0 };
    }

    const pad = 28;
    const spanX = maxX - minX + pad * 2;
    const spanY = maxY - minY + pad * 2;
    const fitScale = Math.min(SVG_W / spanX, SVG_H / spanY, 1);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    return {
      scale: fitScale,
      tx: SVG_W / 2 - centerX * fitScale,
      ty: SVG_H / 2 - centerY * fitScale,
    };
  }, [connection, projectedStops, highlightedSegment]);

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomToRoute = () => {
    const pts: { x: number; y: number }[] = [];
    for (const p of projectedStops) pts.push({ x: p.x, y: p.y });
    if (connection?.shapePoints) {
      for (const [lat, lon] of connection.shapePoints) {
        pts.push(projectWgs84(lat, lon));
      }
    }
    if (highlightedSegment) {
      if (highlightedSegment.fromLat !== null && highlightedSegment.fromLon !== null) {
        pts.push(projectWgs84(highlightedSegment.fromLat, highlightedSegment.fromLon));
      }
      if (highlightedSegment.toLat !== null && highlightedSegment.toLon !== null) {
        pts.push(projectWgs84(highlightedSegment.toLat, highlightedSegment.toLon));
      }
    }
    if (pts.length < 2) return;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    const spanX = Math.max(40, maxX - minX + 60);
    const spanY = Math.max(40, maxY - minY + 60);
    const targetZoom = Math.min(3.6, Math.max(1, Math.min(SVG_W / spanX, SVG_H / spanY) / autoFitTransform.scale));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const fittedCx = autoFitTransform.tx + cx * autoFitTransform.scale;
    const fittedCy = autoFitTransform.ty + cy * autoFitTransform.scale;

    setZoom(Number(targetZoom.toFixed(2)));
    setPan({
      x: (SVG_W / 2 - fittedCx) * targetZoom,
      y: (SVG_H / 2 - fittedCy) * targetZoom,
    });
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (zoom <= 1) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  return (
    <section
      id="mapa-trasy"
      className="bg-[#111827] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide truncate">
            Mapa przebiegu trasy (WGS84)
          </h2>
          {highlightedSegment ? (
            <p className="text-xs text-cyan-300 truncate mt-0.5">
              Odcinek: {highlightedSegment.fromName} → {highlightedSegment.toName}
              {connection ? ` (${connection.originName} → ${connection.destinationName})` : ''}
            </p>
          ) : connection ? (
            <p className="text-xs text-slate-400 truncate mt-0.5">
              {connection.originName} → {connection.destinationName}
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">Wybierz połączenie z listy</p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleZoomToRoute}
            disabled={!connection && !highlightedSegment}
            title="Przybliż do wybranej trasy"
            className="p-1.5 rounded border border-white/10 bg-[#0B101B] text-slate-300 hover:text-amber-400 hover:border-amber-500/40 disabled:opacity-40 transition-colors cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(3.6, Number((z + 0.4).toFixed(1))))}
            title="Przybliż mapę"
            className="p-1.5 rounded border border-white/10 bg-[#0B101B] text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom((z) => {
                const next = Math.max(1, Number((z - 0.4).toFixed(1)));
                if (next === 1) setPan({ x: 0, y: 0 });
                return next;
              });
            }}
            title="Oddal mapę"
            className="p-1.5 rounded border border-white/10 bg-[#0B101B] text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleResetView}
            title="Resetuj widok mapy"
            className="p-1.5 rounded border border-white/10 bg-[#0B101B] text-slate-300 hover:text-amber-400 hover:border-amber-500/40 transition-colors cursor-pointer"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="relative bg-[#090D16] h-[340px] select-none overflow-hidden">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-48 h-48 rounded-full border border-white/5 bg-white/[0.02] animate-pulse" />
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className={`w-full h-full ${zoom > 1 ? (isDragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <g
              transform={`translate(${SVG_W / 2 + pan.x}, ${SVG_H / 2 + pan.y}) scale(${zoom}) translate(${-SVG_W / 2}, ${-SVG_H / 2}) translate(${autoFitTransform.tx}, ${autoFitTransform.ty}) scale(${autoFitTransform.scale})`}
            >
              {(() => {
                const eff = zoom * autoFitTransform.scale;
                return (
                  <>
                    {/* Coordinate graticule */}
                    <g stroke="rgba(148,163,184,0.07)" strokeWidth={1 / eff}>
                      {graticuleLines.hLines.map((line) => (
                        <line key={line.label} x1={line.x1} y1={line.y} x2={line.x2} y2={line.y} />
                      ))}
                      {graticuleLines.vLines.map((line) => (
                        <line key={line.label} x1={line.x} y1={line.y1} x2={line.x} y2={line.y2} />
                      ))}
                    </g>

                    {/* Poland border silhouette */}
                    <path
                      d={borderPath}
                      fill="#0F172A"
                      stroke="#334155"
                      strokeWidth={1.5 / eff}
                      strokeLinejoin="round"
                    />

                    {/* Subtle reference cities */}
                    {REFERENCE_CITIES.map((city) => {
                      const pt = projectWgs84(city.lat, city.lon);
                      return (
                        <g key={city.name} pointerEvents="none">
                          <circle cx={pt.x} cy={pt.y} r={2 / eff} fill="#475569" />
                          <text
                            x={pt.x + 5 / eff}
                            y={pt.y + 3 / eff}
                            fontSize={9 / eff}
                            fill="#64748B"
                            fontFamily="Plus Jakarta Sans, sans-serif"
                          >
                            {city.name}
                          </text>
                        </g>
                      );
                    })}

                    {/* Selected route polyline */}
                    {routePolyline && (
                      <>
                        <polyline
                          points={routePolyline}
                          fill="none"
                          stroke={
                            highlightedSegment
                              ? 'rgba(245, 158, 11, 0.14)'
                              : 'rgba(245, 158, 11, 0.25)'
                          }
                          strokeWidth={6 / eff}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points={routePolyline}
                          fill="none"
                          stroke={
                            highlightedSegment
                              ? 'rgba(245, 158, 11, 0.45)'
                              : '#F59E0B'
                          }
                          strokeWidth={(highlightedSegment ? 1.8 : 2.2) / eff}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* Highlighted A -> B speed segment polyline */}
                    {highlightedSegmentPolyline && (
                      <>
                        <polyline
                          points={highlightedSegmentPolyline}
                          fill="none"
                          stroke="rgba(34, 211, 238, 0.28)"
                          strokeWidth={8 / eff}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <polyline
                          points={highlightedSegmentPolyline}
                          fill="none"
                          stroke="#22D3EE"
                          strokeWidth={3.2 / eff}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </>
                    )}

                    {/* Fallback pins when highlightedSegment is active before trip-details arrives */}
                    {highlightedSegment &&
                      projectedStops.length === 0 &&
                      highlightedSegment.fromLat !== null &&
                      highlightedSegment.fromLon !== null &&
                      highlightedSegment.toLat !== null &&
                      highlightedSegment.toLon !== null && (
                        <>
                          {[
                            {
                              label: highlightedSegment.fromName,
                              pt: projectWgs84(
                                highlightedSegment.fromLat,
                                highlightedSegment.fromLon,
                              ),
                            },
                            {
                              label: highlightedSegment.toName,
                              pt: projectWgs84(
                                highlightedSegment.toLat,
                                highlightedSegment.toLon,
                              ),
                            },
                          ].map((item) => (
                            <g key={item.label}>
                              <circle
                                cx={item.pt.x}
                                cy={item.pt.y}
                                r={5 / eff}
                                fill="#22D3EE"
                                stroke="#090D16"
                                strokeWidth={1.4 / eff}
                              />
                              <text
                                x={item.pt.x + 8 / eff}
                                y={item.pt.y - 6 / eff}
                                fontSize={10.5 / eff}
                                fontWeight="600"
                                fill="#A5F3FC"
                                fontFamily="Outfit, sans-serif"
                                stroke="#090D16"
                                strokeWidth={3 / eff}
                                paintOrder="stroke"
                              >
                                {item.label}
                              </text>
                            </g>
                          ))}
                        </>
                      )}

                    {/* Route station pins */}
                    {projectedStops.map(({ stop, x, y }) => {
                      const isHovered = hoveredStationId === stop.stationId;
                      const isSegmentPin =
                        highlightedSegment !== null &&
                        (stop.stationId === highlightedSegment.fromStationId ||
                          stop.stationId === highlightedSegment.toStationId);
                      const isEndpoint = stop.isOrigin || stop.isDestination;
                      const fill = isSegmentPin
                        ? '#22D3EE'
                        : stop.isOrigin
                          ? '#10B981'
                          : stop.isDestination
                            ? '#F43F5E'
                            : isHovered
                              ? '#FDE68A'
                              : '#F59E0B';
                      const radius = isHovered
                        ? 6 / eff
                        : isSegmentPin
                          ? 5.2 / eff
                          : isEndpoint
                            ? 4.8 / eff
                            : 2.6 / eff;

                      return (
                        <g
                          key={`${stop.orderNumber}-${stop.stationId}`}
                          className="cursor-pointer"
                          onMouseEnter={() => onHoverStation(stop.stationId)}
                          onMouseLeave={() => onHoverStation(null)}
                          onClick={() => onHoverStation(stop.stationId)}
                        >
                          <circle cx={x} cy={y} r={10 / eff} fill="transparent" />
                          {isHovered && (
                            <circle
                              cx={x}
                              cy={y}
                              r={9 / eff}
                              fill="none"
                              stroke={isSegmentPin ? '#22D3EE' : '#F59E0B'}
                              strokeWidth={1.5 / eff}
                            />
                          )}
                          <circle
                            cx={x}
                            cy={y}
                            r={radius}
                            fill={fill}
                            stroke="#090D16"
                            strokeWidth={1.2 / eff}
                          />
                          {(isEndpoint || isHovered || isSegmentPin) && (
                            <text
                              x={x + 8 / eff}
                              y={y - 6 / eff}
                              fontSize={10.5 / eff}
                              fontWeight="600"
                              fill={isSegmentPin ? '#A5F3FC' : '#F8FAFC'}
                              fontFamily="Outfit, sans-serif"
                              stroke="#090D16"
                              strokeWidth={3 / eff}
                              paintOrder="stroke"
                            >
                              {stop.name}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </g>
          </svg>
        )}

        {/* Map Legend & Hover Info Overlay */}
        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between gap-3 pointer-events-none">
          <div className="flex items-center gap-3 text-[11px] text-slate-300 bg-[#090D16]/90 border border-white/10 px-2.5 py-1 rounded">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              Start
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              Postój
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
              Koniec
            </span>
            {highlightedSegment && (
              <span className="flex items-center gap-1.5 text-cyan-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400 inline-block" />
                Odcinek A→B
              </span>
            )}
          </div>

          {activeStop && (
            <div className="text-[11px] font-mono tabular-nums text-amber-200 bg-[#090D16]/95 border border-amber-500/30 px-2.5 py-1 rounded truncate max-w-[260px]">
              {activeStop.name} ·{' '}
              {activeStop.arrivalTime ?? activeStop.departureTime ?? '--:--'} ·{' '}
              {formatDistanceKm(activeStop.cumulativeKm)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
