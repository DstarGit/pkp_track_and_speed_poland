import React, { useMemo, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { StationDailySummary, StationSortMode } from '../types/railway';

interface StationsTableProps {
  stations: StationDailySummary[];
  sortMode: StationSortMode;
  selectedStationId: string | null;
  selectedCarrier: string;
  onSelectStation: (station: StationDailySummary) => void;
  isLoading: boolean;
  onResetFilters: () => void;
}

const PAGE_SIZE = 80;

export const StationsTable: React.FC<StationsTableProps> = ({
  stations,
  sortMode,
  selectedStationId,
  selectedCarrier,
  onSelectStation,
  isLoading,
  onResetFilters,
}) => {
  const [selectedLetter, setSelectedLetter] = useState<string>('ALL');
  const [page, setPage] = useState<number>(0);

  const availableLetters = useMemo(() => {
    const letters = new Set<string>();
    for (const s of stations) {
      const first = s.name.trim().charAt(0).toUpperCase();
      if (first) letters.add(first);
    }
    return Array.from(letters).sort((a, b) => a.localeCompare(b, 'pl'));
  }, [stations]);

  const visibleStations = useMemo(() => {
    if (sortMode !== 'alphabetical' || selectedLetter === 'ALL') {
      return stations;
    }
    return stations.filter((s) => s.name.trim().charAt(0).toUpperCase() === selectedLetter);
  }, [stations, sortMode, selectedLetter]);

  useEffect(() => {
    setPage(0);
  }, [sortMode, selectedLetter, stations.length, selectedCarrier]);

  useEffect(() => {
    if (sortMode !== 'alphabetical') {
      setSelectedLetter('ALL');
    }
  }, [sortMode]);

  const totalPages = Math.max(1, Math.ceil(visibleStations.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageSlice = visibleStations.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <section
      id="ranking-stacji"
      className="bg-[#111827] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col"
    >
      <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide">
            {sortMode === 'volume'
              ? 'Stacje przyjmujące najwięcej pociągów w ciągu doby'
              : 'Alfabetyczny spis stacji kolejowych (A → Z)'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Sortowanie według:{' '}
            {sortMode === 'volume' ? (
              <span className="text-emerald-400 font-medium">liczba pociągów w dobie (malejąco)</span>
            ) : (
              <span className="text-emerald-400 font-medium">nazwa stacji alfabetycznie (A–Z)</span>
            )}
            {selectedCarrier !== 'ALL' && (
              <>
                {' '}
                · przewoźnik <span className="font-mono text-slate-300">{selectedCarrier}</span>
              </>
            )}
          </p>
        </div>

        <div className="text-xs font-mono tabular-nums text-slate-400 shrink-0">
          {visibleStations.length.toLocaleString('pl-PL')} stacji
        </div>
      </div>

      {sortMode === 'alphabetical' && availableLetters.length > 0 && (
        <div className="px-3 py-2 border-b border-white/[0.06] bg-[#0B101B] flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => setSelectedLetter('ALL')}
            className={`px-2 py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
              selectedLetter === 'ALL'
                ? 'bg-emerald-400 text-slate-950 font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Wszystkie
          </button>
          {availableLetters.map((letter) => (
            <button
              key={letter}
              type="button"
              onClick={() => setSelectedLetter(letter)}
              className={`px-1.5 py-1 text-[11px] font-mono rounded transition-colors cursor-pointer ${
                selectedLetter === letter
                  ? 'bg-emerald-400 text-slate-950 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {letter}
            </button>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/[0.08] bg-[#0B101B] text-[11px] font-medium text-slate-400 tracking-wide">
              <th className="py-2.5 pl-3 pr-1.5 w-10 text-right">#</th>
              <th className="py-2.5 px-2">Stacja / Przewoźnicy</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Szczyt</th>
              <th className="py-2.5 px-2 text-right whitespace-nowrap">Pocz / Przel / Końc</th>
              <th className="py-2.5 pl-2 pr-3 text-right whitespace-nowrap">
                {selectedCarrier === 'ALL' ? 'Pociągów / dobę' : `Kursy (${selectedCarrier})`}
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-white/[0.06] text-sm">
            {isLoading ? (
              Array.from({ length: 10 }).map((_, idx) => (
                <tr key={idx} className="h-[52px]">
                  <td colSpan={5} className="px-4 py-2">
                    <div className="h-6 bg-white/[0.04] rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : pageSlice.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-14 text-center">
                  <p className="text-sm text-slate-300 font-medium">
                    Brak stacji spełniających wybrane kryteria filtrowania.
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Zmień szukaną frazę, literę alfabetu lub wyczyść filtry.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedLetter('ALL');
                      onResetFilters();
                    }}
                    className="mt-4 px-4 py-2 text-xs font-medium bg-emerald-400 text-slate-950 rounded hover:bg-emerald-300 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Wyczyść filtry
                  </button>
                </td>
              </tr>
            ) : (
              pageSlice.map((station, idx) => {
                const isSelected = station.stationId === selectedStationId;
                const rowIndex = safePage * PAGE_SIZE + idx;
                const displayedCount =
                  selectedCarrier === 'ALL'
                    ? station.totalTrains
                    : (station.carrierCounts[selectedCarrier] ?? 0);

                return (
                  <tr
                    key={station.stationId}
                    onClick={() => onSelectStation(station)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/12' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td
                      className={`py-2.5 pl-3 pr-1.5 text-right font-mono tabular-nums text-xs font-semibold align-top pt-3 ${
                        isSelected || (sortMode === 'volume' && rowIndex < 3)
                          ? 'text-emerald-400'
                          : 'text-slate-500'
                      }`}
                    >
                      {rowIndex + 1}
                    </td>

                    <td className="py-2.5 px-2 align-top">
                      <div className="text-[13px] font-medium leading-snug flex items-center gap-1.5 flex-wrap">
                        <span className={isSelected ? 'text-emerald-200 font-semibold' : 'text-slate-100'}>
                          {station.name}
                        </span>
                        {station.country && station.country !== 'PL' && (
                          <span className="text-[11px] font-mono text-slate-400">
                            ({station.country})
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5 truncate max-w-[230px]">
                        {station.carriers.slice(0, 5).join(' · ')}
                        {station.carriers.length > 5 ? ` +${station.carriers.length - 5}` : ''}
                      </div>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-xs text-slate-300 align-top whitespace-nowrap">
                      <div>{String(station.peakHour).padStart(2, '0')}:00</div>
                      <div className="text-[11px] text-slate-500">{station.peakHourCount} poc.</div>
                    </td>

                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-xs text-slate-400 align-top whitespace-nowrap">
                      {station.startingCount} / {station.passThroughCount} / {station.terminatingCount}
                    </td>

                    <td className="py-2.5 pl-2 pr-3 text-right font-mono tabular-nums text-[13px] font-semibold text-emerald-400 align-top whitespace-nowrap">
                      {displayedCount.toLocaleString('pl-PL')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!isLoading && visibleStations.length > PAGE_SIZE && (
        <div className="px-4 py-2.5 border-t border-white/[0.08] bg-[#0B101B] flex items-center justify-between text-xs text-slate-400">
          <span className="font-mono tabular-nums">
            Pozycje {safePage * PAGE_SIZE + 1}–
            {Math.min((safePage + 1) * PAGE_SIZE, visibleStations.length)} z{' '}
            {visibleStations.length.toLocaleString('pl-PL')}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/[0.05] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Poprzednia
            </button>
            <span className="px-2 font-mono tabular-nums text-slate-300">
              {safePage + 1} / {totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-white/10 text-slate-300 hover:bg-white/[0.05] disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
            >
              Następna
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
