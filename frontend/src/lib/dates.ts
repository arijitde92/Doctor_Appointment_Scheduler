const DAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** Local date as YYYY-MM-DD (the format the scheduler agent expects). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The next `count` calendar dates that fall on `dayName`, starting tomorrow
 * (same-day bookings are excluded because the slot may already have passed).
 */
export function upcomingDates(dayName: string, count = 4, from: Date = new Date()): Date[] {
  const target = DAY_INDEX[dayName.toLowerCase()];
  if (target === undefined) return [];
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate() + 1);
  const offset = (target - start.getDay() + 7) % 7;
  return Array.from({ length: count }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset + i * 7));
}
