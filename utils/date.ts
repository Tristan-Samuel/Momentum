const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function differenceInDays(startDateKey: string, endDateKey: string): number {
  const start = parseDateKey(startDateKey).getTime();
  const end = parseDateKey(endDateKey).getTime();
  return Math.max(0, Math.floor((end - start) / DAY_IN_MS));
}

export function getProgressionWeek(startDateKey: string, targetDateKey: string): number {
  return Math.floor(differenceInDays(startDateKey, targetDateKey) / 7);
}

export function shiftDateKey(dateKey: string, dayOffset: number): string {
  const shifted = new Date(parseDateKey(dateKey).getTime() + dayOffset * DAY_IN_MS);
  return getLocalDateKey(new Date(shifted));
}

export function getPastDateKeys(count: number, endDateKey: string = getLocalDateKey()): string[] {
  return Array.from({ length: count }, (_, index) => shiftDateKey(endDateKey, index - (count - 1)));
}
