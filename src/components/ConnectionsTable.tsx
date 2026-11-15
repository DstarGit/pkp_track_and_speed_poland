import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { LongestConnection, SortCriterion } from '../types/railway';
import { formatDistanceKm, formatDuration } from '../utils/formatters';

interface ConnectionsTableProps {
  connections: LongestConnection[];
  selectedId: string | null;
  onSelect: (connection: LongestConnection) => void;
  sortBy: SortCriterion;
  isLoading: boolean;
  onResetFilters: () => void;
}

function renderLiveLabel(connection: LongestConnection) {
  if (!connection.live) return null;
  const { trainStatus, statusLabel, delayMinutes } = connection.live;

  if (trainStatus === 'X') {
    return <span className="text-rose-400">Odwołany</span>;
  }
  if (trainStatus === 'Q') {
    return <span className="text-rose-400">Częściowo odwołany</span>;
  }
  if (delayMinutes !== null && delayMinutes > 5) {
    return <span className="text-amber-400">+{delayMinutes} min opóźn.</span>;
  }
  if (delayMinutes !== null && delayMinutes > 0) {
    return <span className="text-amber-300">+{delayMinutes} min</span>;
  }
  if (trainStatus === 'P' || trainStatus === 'C') {
    return <span className="text-emerald-400">Planowo</span>;
  }
  return <span className="text-slate-400">{statusLabel}</span>;
}

export const ConnectionsTable: React.FC<ConnectionsTableProps> = ({
  connections,
  selectedId,
  onSelect,
  sortBy,
  isLoading,
  onResetFilters,
}) => {
  return (
    <section
      id="ranking"
      className="bg-[#111827] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
            Tablica rankingowa najdłuższych połączeń
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sortowanie według:{' '}
            <span className="text-amber-400 font-medium">
              {sortBy === 'distance' ? 'dystans trasy (km)' : 'czas przejazdu'}
            </span>
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
          {connections.length} {connections.length === 1 ? 'połączenie' : 'połączeń'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#0B101B] text-[11px] font-medium text-slate-400 tracking-wide">
              <th className="py-2.5 pl-4 pr-2 w-10 text-right">#</th>
              <th className="py-2.5 px-3">Pociąg</th>
              <th className="py-2.5 px-3">Trasa (Start → Koniec)</th>
              <th className="py-2.5 px-3 text-right">Start</th>
              <th className="py-2.5 px-3 text-right">Koniec</th>
              <th className="py-2.5 px-3 text-right">Dystans</th>
              <th className="py-2.5 px-3 text-right">Czas jazdy</th>
              <th className="py-2.5 pl-3 pr-4 text-right">Stacje</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.06] text-sm">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, idx) => (
                <tr key={idx} className="h-[54px]">
                  <td colSpan={8} className="px-4 py-2">
                    <div className="h-6 bg-white/[0.04] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : connections.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-14 text-center">
                  <p className="text-sm text-slate-300 font-medium">
                    Brak połączeń spełniających wybrane kryteria filtrowania.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Zmień wyszukiwaną stację, wybierz innego przewoźnika lub wyczyść filtry.
                  </p>
                  <button
                    type="button"
                    onClick={onResetFilters}
                    className="mt-4 px-4 py-2 text-xs font-medium bg-amber-500 text-slate-950 rounded hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Wyczyść filtry
                  </button>
                </td>
              </tr>
            ) : (
              connections.map((conn, index) => {
                const isSelected = conn.id === selectedId;
                const liveInfo = renderLiveLabel(conn);

                return (
                  <tr
                    key={conn.id}
                    onClick={() => onSelect(conn)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-amber-500/12'
                        : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td
                      className={`py-2.5 pl-4 pr-2 text-right font-mono tabular-nums text-xs font-semibold align-top pt-3 ${
                        isSelected || index < 3 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </td>

                    <td className="py-2.5 px-3 align-top">
                      <div className="font-mono tabular-nums text-xs font-semibold text-slate-100 whitespace-nowrap">
                        {conn.categorySymbol} {conn.trainNumber}
                        {conn.trainName ? (
                          <span className="font-sans font-medium text-amber-300/90 ml-1.5">
                            {conn.trainName}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5 whitespace-nowrap">
                        <span>{conn.carrierCode}</span>
                        {liveInfo && (
                          <>
                            <span aria-hidden="true">·</span>
                            {liveInfo}
                          </>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 align-top">
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-100 flex-wrap">
                        <span className={isSelected ? 'text-amber-200' : 'text-slate-100'}>
                          {conn.originName}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className={isSelected ? 'text-amber-200' : 'text-slate-100'}>
                          {conn.destinationName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                        W linii prostej: {formatDistanceKm(conn.directDistanceKm)}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums align-top">
                      <span className="text-sm font-semibold text-slate-100">{conn.startTime}</span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums align-top whitespace-nowrap">
                      <span className="text-sm font-semibold text-slate-100">{conn.endTime}</span>
                      {conn.endDayOffset > 0 && (
                        <span className="text-[11px] text-amber-400 ml-1">
                          +{conn.endDayOffset}d
                        </span>
                      )}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums align-top whitespace-nowrap ${
                        sortBy === 'distance' ? 'text-amber-400 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {formatDistanceKm(conn.distanceKm)}
                    </td>

                    <td
                      className={`py-2.5 px-3 text-right font-mono tabular-nums align-top whitespace-nowrap ${
                        sortBy === 'duration' ? 'text-amber-400 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {formatDuration(conn.durationMinutes)}
                    </td>

                    <td className="py-2.5 pl-3 pr-4 text-right font-mono tabular-nums text-xs text-slate-400 align-top pt-3">
                      {conn.stopsCount}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
