import React, { useMemo, useState, useEffect } from 'react';
import { ArrowRight, Clock, Train } from 'lucide-react';
import type { StationDailySummary, StationScheduleResponse } from '../types/railway';

interface StationSchedulePanelProps {
  station: StationDailySummary | null;
  schedule: StationScheduleResponse | null;
  selectedCarrier: string;
  isLoading: boolean;
  error: string | null;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

const ROLE_LABELS = {
  origin: 'Początkowy',
  destination: 'Końcowy',
  through: 'Przelotowy',
} as const;

export const StationSchedulePanel: React.FC<StationSchedulePanelProps> = ({
  station,
  schedule,
  selectedCarrier,
  isLoading,
  error,
}) => {
  const [selectedHour, setSelectedHour] = useState<number | null>(null);
  const [showEmptyHours, setShowEmptyHours] = useState<boolean>(true);

  useEffect(() => {
    setSelectedHour(null);
  }, [station?.stationId]);

  const filteredEvents = useMemo(() => {
    if (!schedule) return [];
    if (selectedCarrier === 'ALL') return schedule.events;
    return schedule.events.filter((ev) => ev.carrierCode === selectedCarrier);
  }, [schedule, selectedCarrier]);

  const hourlyCounts = useMemo(() => {
    const counts = new Array<number>(24).fill(0);
    if (schedule) {
      for (const ev of filteredEvents) {
        if (ev.hour >= 0 && ev.hour < 24) {
          counts[ev.hour] += 1;
        }
      }
      return counts;
    }
    if (station) {
      return station.hourlyCounts;
    }
    return counts;
  }, [schedule, filteredEvents, station]);

  const maxHourCount = useMemo(() => {
    let max = 0;
    for (const c of hourlyCounts) {
      if (c > max) max = c;
    }
    return Math.max(1, max);
  }, [hourlyCounts]);

  const eventsByHour = useMemo(() => {
    const map = new Map<number, typeof filteredEvents>();
    for (let h = 0; h < 24; h++) {
      map.set(h, []);
    }
    for (const ev of filteredEvents) {
      map.get(ev.hour)?.push(ev);
    }
    return map;
  }, [filteredEvents]);

  const displayedHours = useMemo(() => {
    if (selectedHour !== null) return [selectedHour];
    if (showEmptyHours) return HOURS;
    return HOURS.filter((h) => (eventsByHour.get(h)?.length ?? 0) > 0);
  }, [selectedHour, showEmptyHours, eventsByHour]);

  if (!station) {
    return (
      <section className="bg-[#111827] border border-white/[0.08] rounded-lg p-8 text-center">
        <Train className="w-7 h-7 text-slate-500 mx-auto mb-2" />
        <p className="text-sm text-slate-300 font-medium">
          Wybierz stację z listy po lewej lub z listy alfabetycznej powyżej
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Wyświetlimy pełny rozkład pociągów godzina po godzinie w ciągu całej doby.
        </p>
      </section>
    );
  }

  return (
    <section
      id="rozklad-stacji"
      className="bg-[#111827] border border-white/[0.08] rounded-lg overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-100 truncate">{station.name}</h2>
            {station.country && station.country !== 'PL' && (
              <span className="text-xs font-mono text-slate-400">({station.country})</span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
            {schedule
              ? `${filteredEvents.length.toLocaleString('pl-PL')} pociągów w dobie`
              : `${station.totalTrains.toLocaleString('pl-PL')} pociągów w dobie`}
            {' · '}początkowe {schedule ? schedule.startingCount : station.startingCount}
            {' · '}przelotowe {schedule ? schedule.passThroughCount : station.passThroughCount}
            {' · '}końcowe {schedule ? schedule.terminatingCount : station.terminatingCount}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {selectedHour !== null && (
            <button
              type="button"
              onClick={() => setSelectedHour(null)}
              className="px-2.5 py-1 text-xs font-medium rounded border border-emerald-400/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer whitespace-nowrap"
            >
              Wszystkie godziny (00–23)
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowEmptyHours((prev) => !prev)}
            className="px-2.5 py-1 text-xs rounded border border-white/10 bg-[#090D16] text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
          >
            {showEmptyHours ? 'Ukryj puste godziny' : 'Pokaż wszystkie 24h'}
          </button>
        </div>
      </div>

      {/* Interactive 24-Hour Histogram */}
      <div className="px-4 py-3.5 border-b border-white/[0.08] bg-[#0B101B]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-emerald-400" />
            Natężenie ruchu w każdej godzinie doby (kliknij godzinę, aby przefiltrować)
          </span>
          <span className="text-[11px] font-mono tabular-nums text-slate-400">
            Szczyt: {String(station.peakHour).padStart(2, '0')}:00 ({station.peakHourCount} poc.)
          </span>
        </div>

        <div className="grid grid-cols-24 gap-1 items-end h-24 pt-4">
          {HOURS.map((hour) => {
            const count = hourlyCounts[hour] ?? 0;
            const heightPct = count > 0 ? Math.max(8, Math.round((count / maxHourCount) * 100)) : 2;
            const isActiveHour = selectedHour === hour;
            const isDimmed = selectedHour !== null && !isActiveHour;

            return (
              <button
                key={hour}
                type="button"
                onClick={() => setSelectedHour((prev) => (prev === hour ? null : hour))}
                title={`${String(hour).padStart(2, '0')}:00–${String(hour).padStart(2, '0')}:59 — ${count} pociągów`}
                className="group flex flex-col items-center justify-end h-full cursor-pointer focus:outline-none"
              >
                <span
                  className={`text-[9px] font-mono tabular-nums mb-0.5 leading-none transition-colors ${
                    isActiveHour
                      ? 'text-emerald-300 font-bold'
                      : count > 0
                        ? 'text-slate-400 group-hover:text-emerald-300'
                        : 'text-slate-600'
                  }`}
                >
                  {count}
                </span>
                <div className="w-full flex-1 flex items-end">
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-[2px] transition-all ${
                      count === 0
                        ? 'bg-white/[0.06]'
                        : isActiveHour
                          ? 'bg-emerald-300'
                          : isDimmed
                            ? 'bg-emerald-500/25 group-hover:bg-emerald-400/60'
                            : 'bg-emerald-400/80 group-hover:bg-emerald-300'
                    }`}
                  />
                </div>
                <span
                  className={`mt-1 text-[10px] font-mono tabular-nums leading-none ${
                    isActiveHour ? 'text-emerald-300 font-bold' : 'text-slate-500'
                  }`}
                >
                  {String(hour).padStart(2, '0')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Hourly Schedule Body */}
      <div className="max-h-[760px] overflow-y-auto divide-y divide-white/[0.08]">
        {error ? (
          <div className="p-6 text-center text-sm text-rose-300">{error}</div>
        ) : isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-10 bg-white/[0.04] rounded animate-pulse" />
            ))}
          </div>
        ) : (
          displayedHours.map((hour) => {
            const hourEvents = eventsByHour.get(hour) ?? [];
            const hourLabel = `${String(hour).padStart(2, '0')}:00 – ${String(hour).padStart(2, '0')}:59`;

            return (
              <div key={hour} className="bg-[#111827]">
                <div className="px-4 py-2 bg-[#0B101B]/80 flex items-center justify-between sticky top-0 z-10 border-b border-white/[0.04]">
                  <span className="font-mono tabular-nums text-xs font-semibold text-emerald-400">
                    {hourLabel}
                  </span>
                  <span className="font-mono tabular-nums text-[11px] text-slate-400">
                    {hourEvents.length}{' '}
                    {hourEvents.length === 1
                      ? 'pociąg'
                      : hourEvents.length >= 2 && hourEvents.length <= 4
                        ? 'pociągi'
                        : 'pociągów'}
                  </span>
                </div>

                {hourEvents.length === 0 ? (
                  <div className="px-4 py-2 text-xs text-slate-500">
                    Brak planowych przyjazdów i odjazdów w tej godzinie.
                  </div>
                ) : (
                  <div className="divide-y divide-white/[0.05]">
                    {hourEvents.map((ev) => (
                      <div
                        key={ev.id}
                        className="px-4 py-2.5 hover:bg-white/[0.02] transition-colors grid grid-cols-12 gap-2 items-center text-xs"
                      >
                        <div className="col-span-3 sm:col-span-2 font-mono tabular-nums whitespace-nowrap">
                          <div className="text-slate-100 font-semibold text-[13px]">
                            {ev.departureTime ?? ev.arrivalTime ?? ev.eventTime}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {ev.stopRole === 'origin'
                              ? 'Odjazd pocz.'
                              : ev.stopRole === 'destination'
                                ? 'Przyj. końc.'
                                : ev.arrivalTime && ev.departureTime && ev.arrivalTime !== ev.departureTime
                                  ? `Przyj. ${ev.arrivalTime}${ev.dwellMinutes ? ` (${ev.dwellMinutes}m)` : ''}`
                                  : `Postój ${ev.eventTime}`}
                          </div>
                        </div>

                        <div className="col-span-4 sm:col-span-3 min-w-0">
                          <div className="font-mono tabular-nums font-semibold text-slate-100 truncate">
                            {ev.categorySymbol} {ev.trainNumber}
                            {ev.trainName ? (
                              <span className="font-sans font-medium text-amber-300/90 ml-1.5">
                                {ev.trainName}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {ev.carrierCode} · {ROLE_LABELS[ev.stopRole]}
                          </div>
                        </div>

                        <div className="col-span-5 sm:col-span-5 min-w-0">
                          <div className="flex items-center gap-1 text-slate-200 font-medium truncate">
                            <span className="truncate">{ev.originName}</span>
                            <ArrowRight className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="truncate">{ev.destinationName}</span>
                          </div>
                          {ev.stopRole === 'origin' && (
                            <div className="text-[11px] text-emerald-400/80">
                              Rozpoczyna bieg na tej stacji
                            </div>
                          )}
                          {ev.stopRole === 'destination' && (
                            <div className="text-[11px] text-slate-400">
                              Kończy bieg na tej stacji
                            </div>
                          )}
                        </div>

                        <div className="hidden sm:block sm:col-span-2 text-right font-mono tabular-nums text-[11px] text-slate-400 whitespace-nowrap">
                          {ev.platform || ev.track ? (
                            <span>
                              {ev.platform ? `Per. ${ev.platform}` : ''}
                              {ev.platform && ev.track ? ' / ' : ''}
                              {ev.track ? `Tor ${ev.track}` : ''}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
};
