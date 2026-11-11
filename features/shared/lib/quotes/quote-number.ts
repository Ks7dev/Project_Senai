import "server-only"
import type { Prisma } from "@/generated/prisma/client"

/** Prefix of the readable quote numbers. */
export const QUOTE_NUMBER_PREFIX = "COT"

/**
 * Builds a readable quote number, e.g. "COT-2026-000123" (RF06).
 *
 * @param year - Year of the request (UTC).
 * @param sequence - Sequence inside the year.
 * @returns The number.
 */
export function formatQuoteNumber(year: number, sequence: number): string {
  return `${QUOTE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`
}

/**
 * Next readable quote number of the year (RF06). The last number is
 * read with `SELECT ... FOR UPDATE` (justified raw query: Prisma has no
 * row lock), so concurrent requests wait for each other; the unique
 * index on `quotes.number` is the last guard.
 *
 * @param tx - Prisma transaction.
 * @param now - Request date.
 * @returns The number.
 */
export async function nextQuoteNumber(
  tx: Prisma.TransactionClient,
  now: Date
): Promise<string> {
  const year = now.getUTCFullYear()
  const prefix = `${QUOTE_NUMBER_PREFIX}-${year}-`
  const rows = await tx.$queryRaw<Array<{ number: string }>>`
    SELECT number FROM quotes
    WHERE number LIKE ${`${prefix}%`}
    ORDER BY number DESC
    LIMIT 1
    FOR UPDATE`
  const last = Number(rows[0]?.number.slice(prefix.length) ?? 0)
  return formatQuoteNumber(year, (Number.isInteger(last) ? last : 0) + 1)
}

/**
 * Whether a Prisma error is a unique conflict or a deadlock, which a new
 * attempt of the numbering transaction solves.
 *
 * @param error - Caught error.
 * @returns True when the transaction may be retried.
 */
export function isRetryableQuoteError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === "P2002" || code === "P2034"
}
