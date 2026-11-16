import type { QuoteStatusKey } from "@/features/shared/lib/quotes/quote-status"

/** One day, in milliseconds. */
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Statuses whose prices stop holding when the validity ends (RN02).
 * Rejected, converted and already expired quotes are final.
 */
export const EXPIRABLE_QUOTE_STATUSES: readonly QuoteStatusKey[] = [
  "REQUESTED",
  "IN_REVIEW",
  "ANSWERED",
  "ACCEPTED",
]

/** Message when an action needs prices that are no longer valid. */
export const QUOTE_EXPIRED_MESSAGE =
  "A validade desta cotação terminou. Revalide os preços para continuar."

/** Message when a quote still valid is sent to revalidation. */
export const QUOTE_STILL_VALID_MESSAGE =
  "Esta cotação não está vencida; os preços continuam válidos."

/** The fields of a quote that decide whether its prices still hold. */
export type QuoteValidity = {
  /** Stored status. */
  status: QuoteStatusKey
  /** End of the validity, when set. */
  validUntil: Date | null
}

/**
 * End of the validity of a quote (RN02): the configured number of
 * calendar days ("dias corridos") after the prices were given.
 *
 * @param from - When the prices were given (request, answer or revalidation).
 * @param days - Validity in calendar days, from the settings table.
 * @returns The end of the validity.
 */
export function quoteValidUntil(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS)
}

/**
 * Whether the prices of a quote are no longer valid (RN02).
 *
 * @param quote - Status and end of the validity.
 * @param now - Reference time.
 * @returns True when the quote is past its validity.
 */
export function isQuoteExpired(quote: QuoteValidity, now: Date): boolean {
  if (quote.status === "EXPIRED") return true
  return (
    EXPIRABLE_QUOTE_STATUSES.includes(quote.status) &&
    quote.validUntil !== null &&
    quote.validUntil.getTime() <= now.getTime()
  )
}

/**
 * Status to show: a quote past its validity reads as expired even
 * before the background job updates the row.
 *
 * @param quote - Status and end of the validity.
 * @param now - Reference time.
 * @returns The status to show.
 */
export function effectiveQuoteStatus(
  quote: QuoteValidity,
  now: Date
): QuoteStatusKey {
  return isQuoteExpired(quote, now) ? "EXPIRED" : quote.status
}
