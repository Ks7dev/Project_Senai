import { fromCents, toCents } from "@/features/shared/lib/shipping/strategies"

/** Credit status of a corporate account for invoiced purchases (RF58). */
export type CreditStatusKey = "NONE" | "PENDING" | "APPROVED" | "REJECTED"

/** Label and badge tone of each credit status, in Portuguese. */
export const CREDIT_STATUS: Record<
  CreditStatusKey,
  { label: string; tone: "neutral" | "done" | "problem" }
> = {
  NONE: { label: "Sem análise", tone: "neutral" },
  PENDING: { label: "Em análise", tone: "neutral" },
  APPROVED: { label: "Aprovado", tone: "done" },
  REJECTED: { label: "Recusado", tone: "problem" },
}

/** Credit position of a corporate account (RN10). */
export type CreditPosition = {
  /** Credit status. */
  status: CreditStatusKey
  /** Credit limit, decimal string, or null when there is none. */
  limit: string | null
  /** Credit in use by open invoiced orders, decimal string. */
  used: string
  /** Credit still available, decimal string (never negative). */
  available: string
  /** Whether the account may place a new invoiced order now. */
  canBuyInvoiced: boolean
}

/** Message when the account is not approved for invoiced purchases (RN03). */
export const CREDIT_NOT_APPROVED_MESSAGE =
  "A compra faturada está disponível só para contas corporativas aprovadas pelo financeiro."

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Message when an invoiced order exceeds the available credit (RN10).
 *
 * @param available - Available credit, decimal string.
 * @returns The message, in Portuguese.
 */
export function creditExceededMessage(available: string): string {
  return `O pedido ultrapassa o limite de crédito disponível para compra faturada (disponível: ${brl.format(Number(available))}). Escolha outra forma de pagamento ou fale com o financeiro.`
}

/**
 * Builds the credit position of an account from its status, limit and
 * the credit in use (RN10). Only an approved account with a positive
 * limit has credit; the available amount never goes below zero, so a
 * limit lowered below the use simply blocks new invoiced orders.
 *
 * @param input - Status, limit and used credit (decimal strings).
 * @returns The position.
 */
export function creditPosition(input: {
  status: CreditStatusKey
  limit: string | null
  used: string
}): CreditPosition {
  const approved = input.status === "APPROVED" && input.limit !== null
  const limitCents = approved ? toCents(input.limit!) : 0
  const usedCents = toCents(input.used)
  const availableCents = Math.max(0, limitCents - usedCents)
  return {
    status: input.status,
    limit: input.limit,
    used: fromCents(usedCents),
    available: fromCents(availableCents),
    canBuyInvoiced: approved && availableCents > 0,
  }
}

/**
 * Whether an invoiced order of an amount fits the credit of the account
 * (RN03, RN10).
 *
 * @param position - Credit position, without the order being checked.
 * @param amount - Order total, decimal string.
 * @returns `{ allowed: true }` or `{ allowed: false, code, message }`.
 */
export function checkInvoicedCredit(
  position: CreditPosition,
  amount: string
):
  | { allowed: true }
  | {
      allowed: false
      code: "credit_not_approved" | "credit_limit_exceeded"
      message: string
    } {
  if (position.status !== "APPROVED" || position.limit === null) {
    return {
      allowed: false,
      code: "credit_not_approved",
      message: CREDIT_NOT_APPROVED_MESSAGE,
    }
  }
  if (toCents(amount) > toCents(position.available)) {
    return {
      allowed: false,
      code: "credit_limit_exceeded",
      message: creditExceededMessage(position.available),
    }
  }
  return { allowed: true }
}
