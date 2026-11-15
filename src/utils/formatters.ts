import type { CategoryGroup } from '../types/railway';

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
}

export function formatDurationSeconds(totalSeconds: number): string {
  const totalMinutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  if (totalMinutes >= 60) {
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${hours}h ${String(mins).padStart(2, '0')}m`;
  }
  if (seconds > 0) {
    return `${totalMinutes}m ${String(seconds).padStart(2, '0')}s`;
  }
  return `${totalMinutes} min`;
}

export function formatDistanceKm(km: number): string {
  return `${km.toLocaleString('pl-PL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km`;
}

export function formatSpeedKmh(kmh: number): string {
  return `${kmh.toLocaleString('pl-PL', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} km/h`;
}

export function formatFetchedTime(isoString: string): string {
  try {
    return new Intl.DateTimeFormat('pl-PL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function getTodayWarsawInputValue(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Warsaw',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export const CATEGORY_GROUP_LABELS: Record<CategoryGroup, string> = {
  EIP: 'EIP (Pendolino)',
  EIC_EC: 'EIC / EC',
  IC: 'IC / EN / MP',
  TLK_IR: 'TLK / IR / Ex',
  ACCELERATED: 'Przyspieszone (RE / OsP)',
  LOCAL: 'Osobowe / Aglomeracyjne',
};
