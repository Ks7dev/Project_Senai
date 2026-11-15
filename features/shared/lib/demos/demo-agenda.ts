import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  parseDemoRules,
  type DemoRules,
} from "@/features/shared/lib/demos/demo-calendar"
import { getSetting } from "@/features/shared/lib/settings/settings"

/** Client able to read settings and demonstration requests. */
type AgendaClient = Pick<Prisma.TransactionClient, "setting" | "demoRequest">

/**
 * Loads the demonstration agenda from the `settings` table (RF19);
 * values are never hardcoded.
 *
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadDemoRules(
  client: AgendaClient = prisma
): Promise<DemoRules> {
  const [
    minBusinessDays,
    windowDays,
    weekdays,
    timeSlots,
    slotCapacity,
    blockedDates,
  ] = await Promise.all([
    getSetting("demo.min_business_days", client),
    getSetting("demo.window_days", client),
    getSetting("demo.weekdays", client),
    getSetting("demo.time_slots", client),
    getSetting("demo.slot_capacity", client),
    getSetting("demo.blocked_dates", client),
  ])
  return parseDemoRules({
    minBusinessDays,
    windowDays,
    weekdays,
    timeSlots,
    slotCapacity,
    blockedDates,
  })
}

/**
 * Demonstrations already booked (requested or confirmed) from a date
 * on, counted per start instant.
 *
 * @param from - First instant of the window.
 * @param client - Prisma client or transaction.
 * @returns Bookings per start instant (ISO string).
 */
export async function loadDemoBookings(
  from: Date,
  client: AgendaClient = prisma
): Promise<Map<string, number>> {
  const rows = await client.demoRequest.groupBy({
    by: ["scheduledAt"],
    where: {
      scheduledAt: { gte: from },
      status: { in: ["REQUESTED", "CONFIRMED"] },
    },
    _count: { _all: true },
  })
  return new Map(
    rows.map((row) => [row.scheduledAt.toISOString(), row._count._all])
  )
}
