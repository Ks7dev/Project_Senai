/** Quote statuses (RF05, RF06, RF20, RN02). */
export type QuoteStatusKey =
  | "REQUESTED"
  | "IN_REVIEW"
  | "ANSWERED"
  | "ACCEPTED"
  | "REJECTED"
  | "EXPIRED"
  | "CONVERTED"

/** Customer-facing label and badge tone of each quote status. */
export const QUOTE_STATUS: Record<
  QuoteStatusKey,
  { label: string; tone: "neutral" | "progress" | "done" | "problem" }
> = {
  REQUESTED: { label: "Solicitada", tone: "neutral" },
  IN_REVIEW: { label: "Em análise", tone: "progress" },
  ANSWERED: { label: "Respondida", tone: "progress" },
  ACCEPTED: { label: "Aprovada pelo cliente", tone: "progress" },
  REJECTED: { label: "Recusada", tone: "problem" },
  EXPIRED: { label: "Vencida", tone: "problem" },
  CONVERTED: { label: "Convertida em pedido", tone: "done" },
}

/** Statuses of a quote still open (waiting for someone to act). */
export const OPEN_QUOTE_STATUSES: readonly QuoteStatusKey[] = [
  "REQUESTED",
  "IN_REVIEW",
  "ANSWERED",
  "ACCEPTED",
]

/**
 * Whether a value is a quote status key.
 *
 * @param value - Any string, e.g. from the URL.
 * @returns True when it is a status.
 */
export function isQuoteStatus(value: unknown): value is QuoteStatusKey {
  return typeof value === "string" && value in QUOTE_STATUS
}
