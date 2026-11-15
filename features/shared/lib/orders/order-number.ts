import "server-only"
import type { Prisma } from "@/generated/prisma/client"

/**
 * Next readable order number of the year, e.g. "AB-2026-000124". The
 * last number is read with `SELECT ... FOR UPDATE` (justified raw query:
 * Prisma has no row lock), so concurrent orders wait for each other;
 * the unique index is the last guard.
 *
 * @param tx - Prisma transaction.
 * @param now - Order date.
 * @returns The number.
 */
export async function nextOrderNumber(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<string> {
  const prefix = `AB-${now.getUTCFullYear()}-`
  const rows = await tx.$queryRaw<Array<{ number: string }>>`
    SELECT number FROM orders
    WHERE number LIKE ${`${prefix}%`}
    ORDER BY number DESC
    LIMIT 1
    FOR UPDATE`
  const last = Number(rows[0]?.number.slice(prefix.length) ?? 0)
  const next = (Number.isInteger(last) ? last : 0) + 1
  return `${prefix}${String(next).padStart(6, "0")}`
}

/**
 * Whether a Prisma error is a unique conflict or a deadlock, which a new
 * attempt of the order transaction solves.
 *
 * @param error - Caught error.
 * @returns True when the transaction may be retried.
 */
export function isRetryableOrderError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === "P2002" || code === "P2034"
}
