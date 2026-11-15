import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { prisma } from "@/features/shared/lib/db/prisma"
import { EXPIRABLE_QUOTE_STATUSES } from "@/features/shared/lib/quotes/quote-validity"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"

/** Settings key of the quote validity (RN02). */
export const QUOTE_VALIDITY_SETTING = "quote.validity_days"

/** How many expired quotes one sweep handles at most. */
const SWEEP_BATCH = 200

/**
 * Reads the quote validity in calendar days from the settings table
 * (RN02, 15 days by default in the seed).
 *
 * @param client - Prisma client or transaction.
 * @returns The number of days.
 * @throws Error when the setting is not a positive number.
 */
export async function loadQuoteValidityDays(
  client?: Pick<Prisma.TransactionClient, "setting">
): Promise<number> {
  const days = await getNumberSetting(QUOTE_VALIDITY_SETTING, client)
  if (days <= 0) throw new Error(`Invalid setting: ${QUOTE_VALIDITY_SETTING}`)
  return days
}

/**
 * Marks the quotes past their validity as expired (RN02), one at a
 * time with its audit row, so the sales queue and the customer area
 * show that the prices need revalidation. Run by the background job.
 * A quote answered or revalidated in the meantime keeps its status.
 *
 * @param now - Reference time.
 * @returns How many quotes expired.
 */
export async function expireQuotes(now: Date = new Date()): Promise<number> {
  const where = {
    status: { in: [...EXPIRABLE_QUOTE_STATUSES] },
    validUntil: { lte: now },
  }
  const due = await prisma.quote.findMany({
    where,
    select: { id: true, status: true, validUntil: true },
    orderBy: { validUntil: "asc" },
    take: SWEEP_BATCH,
  })
  let expired = 0
  for (const quote of due) {
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.quote.updateMany({
        where: { id: quote.id, ...where },
        data: { status: "EXPIRED" },
      })
      if (result.count === 0) return false
      await writeAudit(tx, {
        userId: null,
        action: "quote.expire",
        entity: "quote",
        entityId: quote.id,
        before: { status: quote.status, validUntil: quote.validUntil },
        after: { status: "EXPIRED" },
      })
      return true
    })
    if (changed) expired += 1
  }
  return expired
}
