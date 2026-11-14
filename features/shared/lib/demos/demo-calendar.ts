import {
  addDaysToKey,
  DATE_KEY_PATTERN,
  toDateKey,
  type DateKey,
} from "@/features/shared/lib/delivery/installation-calendar"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"

/** Format of a time slot, e.g. "14:00" (São Paulo time). */
export const TIME_SLOT_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/** Configurable agenda of the demonstrations (RF19), from `settings`. */
export type DemoRules = {
  /** Business days of notice before the first date. */
  minBusinessDays: number
  /** Calendar days offered from the first date on. */
  windowDays: number
  /** Weekdays with demonstrations (0 = Sunday … 6 = Saturday). */
  weekdays: number[]
  /** Start times, São Paulo time, e.g. "14:00". */
  timeSlots: string[]
  /** Demonstrations the team takes at the same time. */
  slotCapacity: number
  /** Dates without demonstrations (holidays). */
  blockedDates: DateKey[]
}

/** A time of a demonstration day. */
export type DemoSlot = {
  /** Start time, e.g. "14:00". */
  time: string
  /** Start instant, ISO string (UTC). */
  startsAt: string
  /** Whether the customer may pick it. */
  available: boolean
}

/** A day of the demonstration agenda with its times. */
export type DemoDay = {
  /** Calendar date. */
  date: DateKey
  /** Times of the day. */
  slots: DemoSlot[]
}

/**
 * Validates the agenda stored in the settings, so a wrong value never
 * opens the whole calendar.
 *
 * @param input - Raw values read from the settings.
 * @returns The rules.
 * @throws Error when a value is invalid.
 */
export function parseDemoRules(input: {
  minBusinessDays: unknown
  windowDays: unknown
  weekdays: unknown
  timeSlots: unknown
  slotCapacity: unknown
  blockedDates: unknown
}): DemoRules {
  const integer = (value: unknown, min: number, name: string) => {
    const number = Number(value)
    if (!Number.isInteger(number) || number < min) {
      throw new Error(`Invalid demo setting: ${name}`)
    }
    return number
  }
  const list = (value: unknown, valid: (item: unknown) => boolean) =>
    Array.isArray(value) && value.every(valid)
  if (
    !list(
      input.weekdays,
      (day) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6
    )
  ) {
    throw new Error("Invalid demo setting: weekdays")
  }
  if (
    !list(
      input.timeSlots,
      (slot) => typeof slot === "string" && TIME_SLOT_PATTERN.test(slot)
    )
  ) {
    throw new Error("Invalid demo setting: time_slots")
  }
  if (
    !list(
      input.blockedDates,
      (date) => typeof date === "string" && DATE_KEY_PATTERN.test(date)
    )
  ) {
    throw new Error("Invalid demo setting: blocked_dates")
  }
  return {
    minBusinessDays: integer(input.minBusinessDays, 0, "min_business_days"),
    windowDays: integer(input.windowDays, 1, "window_days"),
    weekdays: (input.weekdays as unknown[]).map(Number),
    timeSlots: [...new Set(input.timeSlots as string[])].sort(),
    slotCapacity: integer(input.slotCapacity, 0, "slot_capacity"),
    blockedDates: input.blockedDates as DateKey[],
  }
}

/**
 * UTC instant of a date and time in São Paulo (UTC−3, no daylight
 * saving time since 2019).
 *
 * @param date - Calendar date.
 * @param time - Time, e.g. "14:00".
 * @returns The instant.
 */
export function demoSlotStart(date: DateKey, time: string): Date {
  return new Date(`${date}T${time}:00.000-03:00`)
}

/**
 * First date the customer may pick: the configured business days of
 * notice after today (at least the next day).
 *
 * @param now - Request time.
 * @param rules - Agenda rules.
 * @returns The date.
 */
export function earliestDemoDate(
  now: Date,
  rules: Pick<DemoRules, "minBusinessDays">
): DateKey {
  const date = toDateKey(addBusinessDays(now, rules.minBusinessDays))
  const tomorrow = addDaysToKey(toDateKey(now), 1)
  return date < tomorrow ? tomorrow : date
}

/**
 * Whether a day of the agenda has demonstrations at all.
 *
 * @param date - Calendar date.
 * @param rules - Agenda rules.
 * @returns True on a configured weekday that is not blocked.
 */
function isDemoDay(date: DateKey, rules: DemoRules): boolean {
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay()
  return rules.weekdays.includes(weekday) && !rules.blockedDates.includes(date)
}

/**
 * Whether a slot may be booked (RF19): inside the window, on a working
 * day, a configured time and with room left.
 *
 * @param input - Date, time, now, rules and bookings per start instant
 *   (ISO string).
 * @returns True when available.
 */
export function isDemoSlotAvailable(input: {
  date: DateKey
  time: string
  now: Date
  rules: DemoRules
  booked: ReadonlyMap<string, number>
}): boolean {
  const { date, time, rules } = input
  const earliest = earliestDemoDate(input.now, rules)
  if (date < earliest || date > addDaysToKey(earliest, rules.windowDays - 1)) {
    return false
  }
  if (!isDemoDay(date, rules) || !rules.timeSlots.includes(time)) return false
  const start = demoSlotStart(date, time)
  return (input.booked.get(start.toISOString()) ?? 0) < rules.slotCapacity
}

/**
 * Demonstration agenda (RF19): every working day of the window with its
 * times, the taken ones marked. Days without any time are left out.
 *
 * @param input - Now, rules and bookings per start instant (ISO).
 * @returns The days, in order.
 */
export function buildDemoAgenda(input: {
  now: Date
  rules: DemoRules
  booked: ReadonlyMap<string, number>
}): DemoDay[] {
  const earliest = earliestDemoDate(input.now, input.rules)
  const days: DemoDay[] = []
  for (let index = 0; index < input.rules.windowDays; index += 1) {
    const date = addDaysToKey(earliest, index)
    if (!isDemoDay(date, input.rules)) continue
    days.push({
      date,
      slots: input.rules.timeSlots.map((time) => ({
        time,
        startsAt: demoSlotStart(date, time).toISOString(),
        available: isDemoSlotAvailable({ ...input, date, time }),
      })),
    })
  }
  return days
}

/** Label of each demonstration mode, in Portuguese. */
export const DEMO_MODE_LABEL = {
  SHOWROOM: "No showroom da Atelier Bureau",
  ONLINE: "Online, por videochamada",
  ON_SITE: "No local do cliente",
} as const

/** Demonstration mode. */
export type DemoModeKey = keyof typeof DEMO_MODE_LABEL

/** Every demonstration mode, in form order. */
export const DEMO_MODES = ["SHOWROOM", "ONLINE", "ON_SITE"] as const

/** Label of each demonstration status, in Portuguese. */
export const DEMO_STATUS_LABEL = {
  REQUESTED: "Solicitada",
  CONFIRMED: "Confirmada",
  CANCELED: "Cancelada",
  DONE: "Realizada",
} as const

/** Demonstration status. */
export type DemoStatusKey = keyof typeof DEMO_STATUS_LABEL

/** Status changes the sales team may make. */
const DEMO_TRANSITIONS: Record<DemoStatusKey, readonly DemoStatusKey[]> = {
  REQUESTED: ["CONFIRMED", "CANCELED"],
  CONFIRMED: ["DONE", "CANCELED"],
  CANCELED: [],
  DONE: [],
}

/**
 * Statuses the sales team may move a demonstration to.
 *
 * @param status - Current status.
 * @returns The next statuses.
 */
export function nextDemoStatuses(
  status: DemoStatusKey
): readonly DemoStatusKey[] {
  return DEMO_TRANSITIONS[status]
}

const demoDateTime = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
})

/**
 * Formats the start of a demonstration for screens and e-mails.
 *
 * @param iso - Start instant, ISO string.
 * @returns E.g. "segunda-feira, 16 de novembro às 14:00".
 */
export function formatDemoDate(iso: string): string {
  return demoDateTime.format(new Date(iso))
}
