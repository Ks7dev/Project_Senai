import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"

/** São Paulo offset from UTC (no daylight saving time since 2019). */
const SAO_PAULO_OFFSET_MS = -3 * 60 * 60 * 1000

/** One day in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/** A calendar date in the São Paulo calendar, e.g. "2026-11-18". */
export type DateKey = string

/** Format of a calendar date sent by the checkout. */
export const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Configurable rules of the delivery and installation scheduling (RN05),
 * read from the `settings` table.
 */
export type InstallationRules = {
  /** Business days of preparation before the first date. */
  minBusinessDays: number
  /** Calendar days offered from the first date on. */
  windowDays: number
  /** Deliveries with installation the team takes per day. */
  dailyCapacity: number
  /** Weekdays with installation team (0 = Sunday … 6 = Saturday). */
  weekdays: number[]
  /** Dates without installation (holidays, collective vacation). */
  blockedDates: DateKey[]
}

/** Why a date may not be chosen. */
export type UnavailableReason =
  "too_early" | "too_late" | "weekday" | "blocked" | "full"

/** A date of the scheduling calendar. */
export type ScheduleDay = {
  /** Calendar date. */
  date: DateKey
  /** Whether the customer may choose it. */
  available: boolean
  /** Why it is blocked; null when available. */
  reason: UnavailableReason | null
}

/** Customer-facing label of each blocking reason, in Portuguese. */
export const UNAVAILABLE_REASON_LABEL: Record<UnavailableReason, string> = {
  too_early: "Antes do prazo",
  too_late: "Fora do período",
  weekday: "Sem instalação",
  blocked: "Feriado",
  full: "Agenda lotada",
}

/**
 * Validates the rules stored in the settings, so a wrong value never
 * opens the whole calendar.
 *
 * @param input - Raw values read from the settings.
 * @returns The rules.
 * @throws Error when a value is invalid.
 */
export function parseInstallationRules(input: {
  minBusinessDays: unknown
  windowDays: unknown
  dailyCapacity: unknown
  weekdays: unknown
  blockedDates: unknown
}): InstallationRules {
  const integer = (value: unknown, min: number, name: string) => {
    const number = Number(value)
    if (!Number.isInteger(number) || number < min) {
      throw new Error(`Invalid installation setting: ${name}`)
    }
    return number
  }
  if (
    !Array.isArray(input.weekdays) ||
    input.weekdays.some(
      (day) => !Number.isInteger(day) || Number(day) < 0 || Number(day) > 6
    )
  ) {
    throw new Error("Invalid installation setting: weekdays")
  }
  if (
    !Array.isArray(input.blockedDates) ||
    input.blockedDates.some(
      (date) => typeof date !== "string" || !DATE_KEY_PATTERN.test(date)
    )
  ) {
    throw new Error("Invalid installation setting: blocked_dates")
  }
  return {
    minBusinessDays: integer(input.minBusinessDays, 1, "min_business_days"),
    windowDays: integer(input.windowDays, 1, "window_days"),
    dailyCapacity: integer(input.dailyCapacity, 0, "daily_capacity"),
    weekdays: input.weekdays.map(Number),
    blockedDates: input.blockedDates as DateKey[],
  }
}

/**
 * Calendar date of an instant in the São Paulo calendar.
 *
 * @param date - Instant.
 * @returns The date, e.g. "2026-11-18".
 */
export function toDateKey(date: Date): DateKey {
  return new Date(date.getTime() + SAO_PAULO_OFFSET_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * Adds calendar days to a date.
 *
 * @param key - Calendar date.
 * @param days - Days to add.
 * @returns The new date.
 */
export function addDaysToKey(key: DateKey, days: number): DateKey {
  return new Date(Date.parse(`${key}T00:00:00.000Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10)
}

/**
 * Instant stored on the order for a scheduled date: noon in São Paulo
 * (15:00 UTC), so the date reads the same in any Brazilian time zone.
 *
 * @param key - Calendar date.
 * @returns The UTC instant.
 */
export function scheduledAtFromKey(key: DateKey): Date {
  return new Date(`${key}T15:00:00.000Z`)
}

/**
 * Start of a calendar date in São Paulo, as a UTC instant.
 *
 * @param key - Calendar date.
 * @returns Midnight of the date in São Paulo.
 */
export function startOfDateKey(key: DateKey): Date {
  return new Date(`${key}T03:00:00.000Z`)
}

/**
 * Whether a string is a real calendar date ("2026-02-30" is not).
 *
 * @param key - Candidate date.
 * @returns True when valid.
 */
export function isValidDateKey(key: string): boolean {
  if (!DATE_KEY_PATTERN.test(key)) return false
  const time = Date.parse(`${key}T00:00:00.000Z`)
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === key
  )
}

/**
 * Business days between the order and the first date: preparation of
 * the team, extras (engraving, services) and the delivery time of the
 * chosen shipping option, when it has one.
 *
 * @param rules - Scheduling rules.
 * @param extraBusinessDays - Business days the cart extras add.
 * @param deliveryDays - Delivery time of the shipping option, or null.
 * @returns The lead time in business days.
 */
export function installationLeadDays(
  rules: Pick<InstallationRules, "minBusinessDays">,
  extraBusinessDays: number,
  deliveryDays: number | null
): number {
  return (
    rules.minBusinessDays +
    Math.max(0, extraBusinessDays) +
    Math.max(0, deliveryDays ?? 0)
  )
}

/**
 * First date the customer may choose.
 *
 * @param now - Order time.
 * @param leadBusinessDays - Lead time in business days (at least 1).
 * @returns The date.
 */
export function earliestInstallationDate(
  now: Date,
  leadBusinessDays: number
): DateKey {
  return toDateKey(addBusinessDays(now, Math.max(1, leadBusinessDays)))
}

/**
 * Why a date may not be scheduled, or null when it may (RN05).
 *
 * @param date - Wanted date.
 * @param input - Order time, lead time, rules and deliveries already
 *   scheduled per date.
 * @returns The reason, or null.
 */
export function unavailableReason(
  date: DateKey,
  input: {
    now: Date
    leadBusinessDays: number
    rules: InstallationRules
    booked: ReadonlyMap<DateKey, number>
  }
): UnavailableReason | null {
  const earliest = earliestInstallationDate(input.now, input.leadBusinessDays)
  if (date < earliest) return "too_early"
  if (date > addDaysToKey(earliest, input.rules.windowDays - 1)) {
    return "too_late"
  }
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  if (!input.rules.weekdays.includes(weekday)) return "weekday"
  if (input.rules.blockedDates.includes(date)) return "blocked"
  if ((input.booked.get(date) ?? 0) >= input.rules.dailyCapacity) return "full"
  return null
}

/**
 * Scheduling calendar: every date of the window, from the first one,
 * with the blocked ones marked (RN05).
 *
 * @param input - Order time, lead time, rules and deliveries already
 *   scheduled per date.
 * @returns The dates, in order.
 */
export function buildInstallationCalendar(input: {
  now: Date
  leadBusinessDays: number
  rules: InstallationRules
  booked: ReadonlyMap<DateKey, number>
}): ScheduleDay[] {
  const earliest = earliestInstallationDate(input.now, input.leadBusinessDays)
  return Array.from({ length: input.rules.windowDays }, (_, index) => {
    const date = addDaysToKey(earliest, index)
    const reason = unavailableReason(date, input)
    return { date, available: reason === null, reason }
  })
}
