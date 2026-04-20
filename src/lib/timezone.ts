export function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    })
    return parseInt(formatter.format(date), 10)
  } catch {
    return date.getHours()
  }
}

export function startOfDayInTimezone(date: Date, timezone: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "00"
  const y = get("year")
  const m = get("month")
  const d = get("day")

  const target = new Date(`${y}-${m}-${d}T00:00:00Z`)
  for (let i = 0; i < 3; i++) {
    const currentHour = getHourInTimezone(target, timezone)
    if (currentHour === 0) break
    target.setUTCHours(target.getUTCHours() - currentHour)
  }
  target.setUTCMinutes(0, 0, 0)
  return target
}

/**
 * Returns an ISO timestamp for the next time `startHour` occurs in `timezone`.
 * DST-safe: iterates until the target's local hour actually equals startHour.
 */
export function getNextAllowedTime(startHour: number, timezone: string): string {
  const now = new Date()
  const clientHourNow = getHourInTimezone(now, timezone)

  const target = new Date(now)
  if (clientHourNow >= startHour) {
    target.setUTCDate(target.getUTCDate() + 1)
  }

  // Fixed-point iteration: keep adjusting until local hour actually matches startHour.
  // Handles DST transitions where a single adjustment is off by 1.
  for (let i = 0; i < 5; i++) {
    const currentLocalHour = getHourInTimezone(target, timezone)
    if (currentLocalHour === startHour) break
    const diff = startHour - currentLocalHour
    target.setUTCHours(target.getUTCHours() + diff)
    target.setUTCMinutes(0, 0, 0)
  }

  return target.toISOString()
}