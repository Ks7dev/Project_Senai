import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  addDaysToKey,
  parseInstallationRules,
  startOfDateKey,
  toDateKey,
  type DateKey,
  type InstallationRules,
} from "@/features/shared/lib/delivery/installation-calendar"
import { getSetting } from "@/features/shared/lib/settings/settings"

/** Prisma client or transaction. */
type Client = Prisma.TransactionClient | typeof prisma

/** Settings of the delivery and installation scheduling (RN05). */
export const INSTALLATION_SETTING_KEYS = {
  minBusinessDays: "installation.min_business_days",
  windowDays: "installation.window_days",
  dailyCapacity: "installation.daily_capacity",
  weekdays: "installation.weekdays",
  blockedDates: "installation.blocked_dates",
} as const

/** Order statuses whose scheduled date no longer takes a slot. */
const RELEASED_STATUSES = ["CANCELED", "REFUNDED"] as const

/**
 * Loads the scheduling rules from the settings (RN05). Values are never
 * hardcoded: the seed creates them and the back office may change them.
 *
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadInstallationRules(
  client: Client = prisma
): Promise<InstallationRules> {
  const keys = INSTALLATION_SETTING_KEYS
  const [minBusinessDays, windowDays, dailyCapacity, weekdays, blockedDates] =
    await Promise.all([
      getSetting(keys.minBusinessDays, client),
      getSetting(keys.windowDays, client),
      getSetting(keys.dailyCapacity, client),
      getSetting(keys.weekdays, client),
      getSetting(keys.blockedDates, client),
    ])
  return parseInstallationRules({
    minBusinessDays,
    windowDays,
    dailyCapacity,
    weekdays,
    blockedDates,
  })
}

/**
 * Deliveries with installation already scheduled per date, between two
 * dates (both included). Canceled and refunded orders free their slot.
 *
 * @param from - First date.
 * @param to - Last date.
 * @param client - Prisma client or transaction.
 * @returns Number of orders per date.
 */
export async function countScheduledByDate(
  from: DateKey,
  to: DateKey,
  client: Client = prisma
): Promise<Map<DateKey, number>> {
  const rows = await client.order.findMany({
    where: {
      scheduledDeliveryAt: {
        gte: startOfDateKey(from),
        lt: startOfDateKey(addDaysToKey(to, 1)),
      },
      status: { notIn: [...RELEASED_STATUSES] },
    },
    select: { scheduledDeliveryAt: true },
  })
  const booked = new Map<DateKey, number>()
  for (const row of rows) {
    if (!row.scheduledDeliveryAt) continue
    const key = toDateKey(row.scheduledDeliveryAt)
    booked.set(key, (booked.get(key) ?? 0) + 1)
  }
  return booked
}

/**
 * Locks the scheduling agenda until the transaction ends (justified raw
 * query: Prisma has no row lock), so two checkouts never take the last
 * slot of the same date.
 *
 * @param tx - Prisma transaction.
 */
export async function lockInstallationAgenda(
  tx: Prisma.TransactionClient
): Promise<void> {
  await tx.$queryRaw`
    SELECT \`key\` FROM settings
    WHERE \`key\` = ${INSTALLATION_SETTING_KEYS.dailyCapacity}
    FOR UPDATE`
}
