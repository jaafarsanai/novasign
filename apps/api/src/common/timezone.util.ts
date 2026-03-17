export function isValidIanaTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function safeTimezone(...candidates: Array<string | null | undefined>): string {
  for (const candidate of candidates) {
    if (isValidIanaTimezone(candidate)) return candidate!;
  }
  return 'UTC';
}

export function getZonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second),
    weekdayShort: map.weekday,
    ymd: `${map.year}-${map.month}-${map.day}`,
  };
}

export function weekdayToScheduleDay(shortWeekday: string):
  'SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' {
  const key = shortWeekday.toLowerCase();
  if (key.startsWith('mon')) return 'MON';
  if (key.startsWith('tue')) return 'TUE';
  if (key.startsWith('wed')) return 'WED';
  if (key.startsWith('thu')) return 'THU';
  if (key.startsWith('fri')) return 'FRI';
  if (key.startsWith('sat')) return 'SAT';
  return 'SUN';
}

export function zonedSecondsOfDay(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone);
  return p.hour * 3600 + p.minute * 60 + p.second;
}