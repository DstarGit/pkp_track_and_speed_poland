import React, { useMemo, useState } from 'react';
import type { LongestConnection } from '../types/railway';
import { formatDistanceKm, formatDuration, formatSpeedKmh } from '../utils/formatters';

interface StationTimelineProps {
  connection: LongestConnection | null;
  hoveredStationId: number | null;
  onHoverStation: (stationId: number | null) => void;
  isLoading: boolean;
  highlightedSegment?: { fromStationId: number; toStationId: number } | null;
}

export const StationTimeline: React.FC<StationTimelineProps> = ({
  connection,
  hoveredStationId,
  onHoverStation,
  isLoading,
  highlightedSegment = null,
}) => {
  const [onlyMajorStops, setOnlyMajorStops] = useState(false);

  const visibleStops = useMemo(() => {
    if (!connection) return [];
    if (!onlyMajorStops) return connection.stops;
    return connection.stops.filter(
      (s) =>
        s.isOrigin ||
        s.isDestination ||
        (highlightedSegment !== null &&
          (s.stationId === highlightedSegment.fromStationId ||
            s.stationId === highlightedSegment.toStationId)) ||
        (s.dwellMinutes !== null && s.dwellMinutes >= 2),
    );
  }, [connection, onlyMajorStops, highlightedSegment]);

  return (
    <section
      id="os-stacji"
      className="bg-[#111827] border border-white/[0.08] rounded-lg flex flex-col overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
            Oś stacji na trasie
          </h2>
          {connection ? (
            <p className="text-xs text-slate-400 mt-0.5 truncate font-mono tabular-nums">
              {connection.categorySymbol} {connection.trainNumber}
              {connection.trainName ? ` „${connection.trainName}”` : ''} ·{' '}
              {formatDistanceKm(connection.distanceKm)} · {formatDuration(connection.durationMinutes)}
              {connection.avgSpeedKmh > 0 ? ` · śr. ${formatSpeedKmh(connection.avgSpeedKmh)}` : ''}
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-0.5">Szczegóły postojów pośrednich</p>
          )}
        </div>

        {connection && connection.stops.length > 10 && (
          <div className="flex items-center gap-1 p-0.5 bg-[#090D16] border border-white/10 rounded shrink-0">
            <button
              type="button"
              onClick={() => setOnlyMajorStops(false)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                !onlyMajorStops
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Wszystkie ({connection.stops.length})
            </button>
            <button
              type="button"
              onClick={() => setOnlyMajorStops(true)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                onlyMajorStops
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Postoje ≥ 2m
            </button>
          </div>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto bg-[#0B101B]">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="h-9 bg-white/[0.04] rounded animate-pulse" />
            ))}
          </div>
        ) : !connection ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Kliknij połączenie lub odcinek w tabeli, aby przejrzeć pełną oś stacji, godziny przyjazdów, odjazdów i prędkości odcinkowe.
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {visibleStops.map((stop) => {
              const isHighlighted = hoveredStationId === stop.stationId;
              const isSegmentEndpoint =
                highlightedSegment !== null &&
                (stop.stationId === highlightedSegment.fromStationId ||
                  stop.stationId === highlightedSegment.toStationId);
              const nodeColor = isSegmentEndpoint
                ? 'bg-cyan-400 border-cyan-200'
                : stop.isOrigin
                  ? 'bg-emerald-500 border-emerald-300'
                  : stop.isDestination
                    ? 'bg-rose-500 border-rose-300'
                    : 'bg-amber-500/80 border-amber-300';

              return (
                <li
                  key={`${stop.orderNumber}-${stop.stationId}`}
                  onMouseEnter={() => onHoverStation(stop.stationId)}
                  onMouseLeave={() => onHoverStation(null)}
                  onClick={() => onHoverStation(stop.stationId)}
                  className={`px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                    isHighlighted
                      ? 'bg-amber-500/10'
                      : isSegmentEndpoint
                        ? 'bg-cyan-500/10'
                        : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 text-right font-mono tabular-nums text-[11px] text-slate-500 shrink-0">
                      {stop.orderNumber}.
                    </span>

                    <span
                      className={`w-2.5 h-2.5 rounded-full border shrink-0 ${nodeColor} ${
                        isHighlighted || isSegmentEndpoint ? 'scale-125' : ''
                      }`}
                    />

                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${
                          isSegmentEndpoint ? 'text-cyan-200' : 'text-slate-100'
                        }`}
                      >
                        {stop.name}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                        {stop.platform && (
                          <span>
                            Peron {stop.platform}
                            {stop.track ? ` / tor ${stop.track}` : ''}
                          </span>
                        )}
                        {stop.platform && stop.dwellMinutes !== null && (
                          <span aria-hidden="true">·</span>
                        )}
                        {stop.dwellMinutes !== null && (
                          <span className="font-mono tabular-nums">
                            postój {stop.dwellMinutes} min
                          </span>
                        )}
                        {!stop.platform && stop.dwellMinutes === null && (
                          <span>
                            {stop.isOrigin
                              ? 'Stacja początkowa'
                              : stop.isDestination
                                ? 'Stacja końcowa'
                                : stop.stopTypeName || 'Postój na trasie'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 text-right font-mono tabular-nums">
                    <div className="text-xs leading-tight">
                      {stop.arrivalTime && (
                        <div className="text-slate-400">
                          prz. <span className="text-slate-200">{stop.arrivalTime}</span>
                          {stop.arrivalDayOffset > 0 && (
                            <span className="text-amber-400 ml-1">+{stop.arrivalDayOffset}d</span>
                          )}
                        </div>
                      )}
                      {stop.departureTime && (
                        <div className="text-slate-400">
                          odj. <span className="text-amber-300 font-medium">{stop.departureTime}</span>
                          {stop.departureDayOffset > 0 && (
                            <span className="text-amber-400 ml-1">+{stop.departureDayOffset}d</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="w-[72px] leading-tight">
                      <div className="text-xs text-slate-300 font-medium">
                        {stop.cumulativeKm.toFixed(1)} km
                      </div>
                      {stop.orderNumber > 1 && stop.segmentSpeedKmh !== null && (
                        <div className="text-[11px] text-cyan-400/90">
                          {formatSpeedKmh(stop.segmentSpeedKmh)}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
};
