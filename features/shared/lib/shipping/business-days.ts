/** São Paulo offset from UTC (no daylight saving time since 2019). */
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000

/**
 * Adds business days to a date, skipping Saturdays and Sundays in the
 * São Paulo calendar. The time of day is kept and the result stays in
 * UTC. Holidays are not considered.
 *
 * @param from - Start date.
 * @param days - Business days to add (0 or more).
 * @returns The resulting date.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const local = new Date(from.getTime() + SAO_PAULO_OFFSET_MS)
  let remaining = Math.max(0, Math.trunc(days))
  while (remaining > 0) {
    local.setUTCDate(local.getUTCDate() + 1)
    const weekday = local.getUTCDay()
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }
  return new Date(local.getTime() - SAO_PAULO_OFFSET_MS)
}
