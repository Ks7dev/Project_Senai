import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { formatTicketNumber } from "@/features/shared/lib/support/ticket-format"

/**
 * Next readable ticket number of the year (RF17). The last number is
 * read with `SELECT ... FOR UPDATE` (justified raw query: Prisma has no
 * row lock), so concurrent tickets wait for each other; the unique
 * index on `support_tickets.number` is the last guard.
 *
 * @param tx - Prisma transaction.
 * @param now - Opening date.
 * @returns The number, e.g. "CHA-2026-000123".
 */
export async function nextTicketNumber(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<string> {
  const year = now.getUTCFullYear()
  const prefix = formatTicketNumber(year, 0).slice(0, -6)
  const rows = await tx.$queryRaw<Array<{ number: string }>>`
    SELECT number FROM support_tickets
    WHERE number LIKE ${`${prefix}%`}
    ORDER BY number DESC
    LIMIT 1
    FOR UPDATE`
  const last = Number(rows[0]?.number.slice(prefix.length) ?? 0)
  return formatTicketNumber(year, (Number.isInteger(last) ? last : 0) + 1)
}
