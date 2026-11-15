import React from 'react';
import { ArrowRight } from 'lucide-react';
import type {
  CategoryGroup,
  LongestConnection,
  SpeedSegmentRecord,
  SpeedViewMode,
} from '../types/railway';
import {
  formatDistanceKm,
  formatDurationSeconds,
  formatSpeedKmh,
} from '../utils/formatters';

export interface SpeedSegmentWithFrequency extends SpeedSegmentRecord {
  frequencyCount?: number;
}

const COMPACT_CATEGORY_LABELS: Record<CategoryGroup, string> = {
  EIP: 'EIP',
  EIC_EC: 'EIC / EC',
  IC: 'IC',
  TLK_IR: 'TLK / IR',
  ACCELERATED: 'Przysp.',
  LOCAL: 'Osobowe',
};

interface SpeedTableProps {
  mode: SpeedViewMode;
  sortCriterion?: 'speed' | 'distance';
  segments: SpeedSegmentWithFrequency[];
  fullRoutes: LongestConnection[];
  selectedSegmentId: string | null;
  selectedFullRouteId: string | null;
  onSelectSegment: (segment: SpeedSegmentRecord) => void;
  onSelectFullRoute: (connection: LongestConnection) => void;
  isLoading: boolean;
  uniqueOnly: boolean;
  minDistanceKm: number;
  onResetFilters: () => void;
}

export const SpeedTable: React.FC<SpeedTableProps> = ({
  mode,
  sortCriterion = 'speed',
  segments,
  fullRoutes,
  selectedSegmentId,
  selectedFullRouteId,
  onSelectSegment,
  onSelectFullRoute,
  isLoading,
  uniqueOnly,
  minDistanceKm,
  onResetFilters,
}) => {
  const rowCount = mode === 'segments' ? segments.length : fullRoutes.length;

  return (
    <section
      id="ranking-predkosci"
      className="bg-[#111827] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
            {sortCriterion === 'distance'
              ? 'Najdłuższe odcinki bez postoju między stacjami (A → B)'
              : mode === 'segments'
                ? 'Najszybsze odcinki między stacjami (A → B)'
                : 'Najszybsze całe trasy pociągów (Start → Koniec)'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sortowanie według:{' '}
            {sortCriterion === 'distance' ? (
              <span className="text-amber-400 font-medium">dystans odcinka (km)</span>
            ) : (
              <span className="text-cyan-400 font-medium">prędkość handlowa (km/h)</span>
            )}
            {sortCriterion === 'speed' && minDistanceKm > 0 && (
              <>
                {' '}
                · próg min.{' '}
                <span className="font-mono tabular-nums text-slate-300">{minDistanceKm} km</span>
              </>
            )}
            {mode === 'segments' && uniqueOnly && (
              <> · tylko unikalne relacje A → B</>
            )}
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
          {rowCount}{' '}
          {mode === 'segments'
            ? rowCount === 1
              ? 'odcinek'
              : 'odcinków'
            : rowCount === 1
              ? 'trasa'
              : 'tras'}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#0B101B] text-[11px] font-medium text-slate-400 tracking-wide">
              <th className="py-2.5 pl-3 pr-1.5 w-8 text-right">#</th>
              <th className="py-2.5 px-2">Pociąg</th>
              <th className="py-2.5 px-2">
                {mode === 'segments' ? 'Odcinek A → B' : 'Cała trasa (Start → Koniec)'}
              </th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">
                {mode === 'segments' ? 'Odjazd' : 'Start'}
              </th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">
                {mode === 'segments' ? 'Przyjazd' : 'Koniec'}
              </th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Dystans</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Czas</th>
              <th className="py-2.5 pl-2 pr-3 text-right whitespace-nowrap">Prędkość śr.</th>
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
            ) : rowCount === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-14 text-center">
                  <p className="text-sm text-slate-300 font-medium">
                    Brak {mode === 'segments' ? 'odcinków' : 'tras'} spełniających wybrane kryteria filtrowania.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Obniż minimalny próg odległości, zmień przewoźnika lub wyczyść filtry.
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
            ) : mode === 'segments' ? (
              segments.map((seg, index) => {
                const isSelected = seg.id === selectedSegmentId;

                return (
                  <tr
                    key={seg.id}
                    onClick={() => onSelectSegment(seg)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-500/12' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td
                      className={`py-2.5 pl-3 pr-1.5 text-right font-mono tabular-nums text-xs font-semibold align-top pt-3 ${
                        isSelected || index < 3 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </td>

                    <td className="py-2.5 px-2 align-top max-w-[165px]">
                      <div className="font-mono tabular-nums text-xs font-semibold text-slate-100 truncate">
                        {seg.categorySymbol} {seg.trainNumber}
                        {seg.trainName ? (
                          <span className="font-sans font-medium text-amber-300/90 ml-1.5">
                            {seg.trainName}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 whitespace-nowrap">
                        <span>{seg.carrierCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">
                          {COMPACT_CATEGORY_LABELS[seg.categoryGroup]}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-2 align-top">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-100 flex-wrap leading-snug">
                        <span className={isSelected ? 'text-cyan-200' : 'text-slate-100'}>
                          {seg.fromStationName}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className={isSelected ? 'text-cyan-200' : 'text-slate-100'}>
                          {seg.toStationName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[260px]">
                        Trasa: {seg.routeOriginName} → {seg.routeDestinationName}
                        {uniqueOnly && seg.frequencyCount && seg.frequencyCount > 1 && (
                          <span className="font-mono tabular-nums text-amber-300/80 ml-1.5">
                            · {seg.frequencyCount}× dziennie
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums align-top whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-slate-100">
                        {seg.departureTime}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums align-top whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-slate-100">
                        {seg.arrivalTime}
                      </span>
                      {seg.endDayOffset > 0 && (
                        <span className="text-[11px] text-amber-400 ml-1">
                          +{seg.endDayOffset}d
                        </span>
                      )}
                    </td>

                    <td
                      className={`py-2.5 px-2 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap ${
                        sortCriterion === 'distance'
                          ? 'font-semibold text-amber-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {formatDistanceKm(seg.distanceKm)}
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap text-slate-300">
                      {formatDurationSeconds(seg.durationSeconds)}
                    </td>

                    <td
                      className={`py-2.5 pl-2 pr-3 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap ${
                        sortCriterion === 'speed'
                          ? 'font-semibold text-cyan-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {formatSpeedKmh(seg.avgSpeedKmh)}
                    </td>
                  </tr>
                );
              })
            ) : (
              fullRoutes.map((conn, index) => {
                const isSelected = conn.id === selectedFullRouteId;

                return (
                  <tr
                    key={conn.id}
                    onClick={() => onSelectFullRoute(conn)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-amber-500/12' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td
                      className={`py-2.5 pl-3 pr-1.5 text-right font-mono tabular-nums text-xs font-semibold align-top pt-3 ${
                        isSelected || index < 3 ? 'text-amber-400' : 'text-slate-500'
                      }`}
                    >
                      {index + 1}
                    </td>

                    <td className="py-2.5 px-2 align-top max-w-[165px]">
                      <div className="font-mono tabular-nums text-xs font-semibold text-slate-100 truncate">
                        {conn.categorySymbol} {conn.trainNumber}
                        {conn.trainName ? (
                          <span className="font-sans font-medium text-amber-300/90 ml-1.5">
                            {conn.trainName}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 whitespace-nowrap">
                        <span>{conn.carrierCode}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-500">
                          {COMPACT_CATEGORY_LABELS[conn.categoryGroup]}
                        </span>
                      </div>
                    </td>

                    <td className="py-2.5 px-2 align-top">
                      <div className="flex items-center gap-1.5 text-[13px] font-medium text-slate-100 flex-wrap leading-snug">
                        <span className={isSelected ? 'text-amber-200' : 'text-slate-100'}>
                          {conn.originName}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className={isSelected ? 'text-amber-200' : 'text-slate-100'}>
                          {conn.destinationName}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums truncate max-w-[260px]">
                        {conn.stopsCount} stacji · w linii prostej{' '}
                        {formatDistanceKm(conn.directDistanceKm)}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums align-top whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-slate-100">
                        {conn.startTime}
                      </span>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums align-top whitespace-nowrap">
                      <span className="text-[13px] font-semibold text-slate-100">
                        {conn.endTime}
                      </span>
                      {conn.endDayOffset > 0 && (
                        <span className="text-[11px] text-amber-400 ml-1">
                          +{conn.endDayOffset}d
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap text-slate-200">
                      {formatDistanceKm(conn.distanceKm)}
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap text-slate-300">
                      {formatDurationSeconds(conn.durationSeconds)}
                    </td>

                    <td className="py-2.5 pl-2 pr-3 text-right font-mono tabular-nums text-[13px] align-top whitespace-nowrap font-semibold text-cyan-400">
                      {formatSpeedKmh(conn.avgSpeedKmh)}
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
