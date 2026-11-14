import {
  addDaysToKey,
  startOfDateKey,
  toDateKey,
} from "@/features/shared/lib/delivery/installation-calendar"

/** Ticket kinds of the exchange, return and withdrawal flow (RN12, RN22). */
export type ReturnKind = "EXCHANGE" | "RETURN" | "WITHDRAWAL"

/** Why the customer asks for an exchange or a return (RN12). */
export type ReturnReasonKey =
  "DEFECT" | "TRANSPORT_DAMAGE" | "WRONG_ITEM" | "NOT_AS_EXPECTED" | "OTHER"

/** What the evaluation decided. */
export type ReturnOutcomeKey = "EXCHANGE" | "REPAIR" | "REFUND"

/**
 * Days of the PF withdrawal right, counted from the receipt (CDC, art.
 * 49; RN22). Law, not a business setting.
 */
export const WITHDRAWAL_DAYS = 7

/** Every exchange or return reason, in form order. */
export const RETURN_REASONS = [
  "DEFECT",
  "TRANSPORT_DAMAGE",
  "WRONG_ITEM",
  "NOT_AS_EXPECTED",
  "OTHER",
] as const satisfies readonly ReturnReasonKey[]

/** Label of each reason, in Portuguese. */
export const RETURN_REASON_LABEL: Record<ReturnReasonKey, string> = {
  DEFECT: "Defeito de fabricação",
  TRANSPORT_DAMAGE: "Avaria no transporte",
  WRONG_ITEM: "Produto diferente do pedido",
  NOT_AS_EXPECTED: "Não atendeu às expectativas",
  OTHER: "Outro motivo",
}

/** Every outcome, in form order. */
export const RETURN_OUTCOMES = [
  "EXCHANGE",
  "REPAIR",
  "REFUND",
] as const satisfies readonly ReturnOutcomeKey[]

/** Label of each outcome, in Portuguese. */
export const RETURN_OUTCOME_LABEL: Record<ReturnOutcomeKey, string> = {
  EXCHANGE: "Troca do produto",
  REPAIR: "Reparo",
  REFUND: "Reembolso",
}

/** Kinds that belong to the exchange, return and withdrawal flow. */
export const RETURN_KINDS: readonly ReturnKind[] = [
  "EXCHANGE",
  "RETURN",
  "WITHDRAWAL",
]

/** Message when a PJ personalized item is not defective (RN12). */
export const PJ_PERSONALIZED_BLOCKED_MESSAGE =
  "Itens personalizados ou sob medida de compras de empresa (PJ) não são trocados nem devolvidos, salvo defeito de fabricação confirmado na avaliação técnica (RN12)."

/** Message when a PJ customer asks for the withdrawal right. */
export const WITHDRAWAL_PF_ONLY_MESSAGE =
  "O direito de arrependimento vale para compras de pessoa física feitas pelo site (CDC, art. 49). Para empresas, solicite troca ou devolução."

/** Message when the withdrawal period ended. */
export const WITHDRAWAL_EXPIRED_MESSAGE = `O prazo de arrependimento de ${WITHDRAWAL_DAYS} dias após o recebimento terminou. Você ainda pode pedir troca ou devolução por defeito, com avaliação técnica.`

/** Message when the order was not delivered yet. */
export const NOT_DELIVERED_MESSAGE =
  "Trocas, devoluções e arrependimento são pedidos depois do recebimento do produto."

/**
 * Whether a ticket kind belongs to the exchange and return flow.
 *
 * @param kind - Ticket kind.
 * @returns True for exchange, return and withdrawal.
 */
export function isReturnKind(kind: string): kind is ReturnKind {
  return (RETURN_KINDS as readonly string[]).includes(kind)
}

/**
 * Last moment of the PF withdrawal right: the end of the seventh
 * calendar day after the receipt, in the São Paulo calendar (RN22).
 *
 * @param deliveredAt - Receipt date.
 * @returns The deadline (exclusive).
 */
export function withdrawalDeadline(deliveredAt: Date): Date {
  return startOfDateKey(
    addDaysToKey(toDateKey(deliveredAt), WITHDRAWAL_DAYS + 1)
  )
}

/** Result of the eligibility check of an exchange, return or withdrawal. */
export type ReturnEligibility =
  | {
      allowed: true
      /** PF withdrawal of a personalized item: legal opinion pending. */
      legalReview: boolean
    }
  | { allowed: false; message: string }

/**
 * Checks an exchange, return or withdrawal request against the
 * commercial policy (RN12, RN22):
 * - nothing before the receipt;
 * - withdrawal only for PF, within 7 days of the receipt, with full
 *   refund and never conditioned on the evaluation; a personalized item
 *   is accepted and flagged for the legal opinion still pending;
 * - PJ personalized or made-to-measure items are refused unless the
 *   reason is a manufacturing defect;
 * - every other exchange or return is accepted for technical evaluation.
 *
 * @param input - Kind, reason, customer type, personalization, receipt
 *   date and now.
 * @returns Whether the request may be opened.
 */
export function checkReturnEligibility(input: {
  kind: ReturnKind
  reason: ReturnReasonKey | null
  personType: "PF" | "PJ"
  personalized: boolean
  deliveredAt: Date | null
  now: Date
}): ReturnEligibility {
  if (!input.deliveredAt) {
    return { allowed: false, message: NOT_DELIVERED_MESSAGE }
  }
  if (input.kind === "WITHDRAWAL") {
    if (input.personType !== "PF") {
      return { allowed: false, message: WITHDRAWAL_PF_ONLY_MESSAGE }
    }
    if (
      input.now.getTime() >= withdrawalDeadline(input.deliveredAt).getTime()
    ) {
      return { allowed: false, message: WITHDRAWAL_EXPIRED_MESSAGE }
    }
    return { allowed: true, legalReview: input.personalized }
  }
  if (
    input.personType === "PJ" &&
    input.personalized &&
    input.reason !== "DEFECT"
  ) {
    return { allowed: false, message: PJ_PERSONALIZED_BLOCKED_MESSAGE }
  }
  return { allowed: true, legalReview: false }
}

/**
 * Whether the kind asks the customer for the reason (exchanges and
 * returns). The withdrawal right needs no justification (RN22).
 *
 * @param kind - Ticket kind.
 * @returns True for exchanges and returns.
 */
export function requiresReturnReason(kind: string): boolean {
  return kind === "EXCHANGE" || kind === "RETURN"
}

/**
 * Outcomes the team may record when resolving a ticket of the flow. The
 * withdrawal right always ends in the full refund (RN22).
 *
 * @param kind - Ticket kind.
 * @returns The allowed outcomes; empty for warranty and assistance.
 */
export function allowedReturnOutcomes(
  kind: string
): readonly ReturnOutcomeKey[] {
  if (kind === "WITHDRAWAL") return ["REFUND"]
  if (isReturnKind(kind)) return RETURN_OUTCOMES
  return []
}

/**
 * Whether the team may deny a ticket. The receipt check of a withdrawal
 * records the state of the product but cannot deny the refund (RN22),
 * except a personalized item waiting for the legal opinion.
 *
 * @param kind - Ticket kind.
 * @param legalReview - Whether the ticket waits for the legal opinion.
 * @returns True when "denied" is allowed.
 */
export function canDenyTicket(kind: string, legalReview: boolean): boolean {
  return kind !== "WITHDRAWAL" || legalReview
}

/**
 * Whether an order item is personalized or made to measure (RF51): it
 * carries the engraving or made-to-measure options.
 *
 * @param personalization - `personalization` JSON of the order item.
 * @returns True when the item was personalized.
 */
export function isPersonalizedItem(personalization: unknown): boolean {
  if (personalization === null || personalization === undefined) return false
  if (typeof personalization === "object") {
    return Object.keys(personalization).length > 0
  }
  return true
}

/**
 * Person type of the purchase: a corporate order or a PJ buyer is PJ.
 *
 * @param input - Corporate account of the order and the buyer type.
 * @returns "PF" or "PJ".
 */
export function purchasePersonType(input: {
  organizationId: string | null
  buyerPersonType: "PF" | "PJ"
}): "PF" | "PJ" {
  return input.organizationId || input.buyerPersonType === "PJ" ? "PJ" : "PF"
}

/** Message when the team denies a withdrawal (RN22). */
export const WITHDRAWAL_CANNOT_BE_DENIED_MESSAGE =
  "O arrependimento não pode ser recusado: a conferência registra o estado do produto, mas o reembolso é integral (RN22)."

/** Message when the outcome of the flow is missing or not allowed. */
export const RETURN_OUTCOME_REQUIRED_MESSAGE =
  "Escolha o resultado da avaliação permitido para este tipo de chamado."

/**
 * Checks how the team ends a ticket of the flow: a resolved exchange,
 * return or withdrawal records an allowed outcome, and a withdrawal is
 * never denied (RN22) unless it waits for the legal opinion.
 *
 * @param input - Kind, legal review flag, wanted status and outcome.
 * @returns The outcome to store (null when none), or the error message.
 */
export function checkReturnResolution(input: {
  kind: string
  legalReview: boolean
  status: string
  outcome: ReturnOutcomeKey | ""
}):
  | { ok: true; outcome: ReturnOutcomeKey | null }
  | { ok: false; message: string } {
  if (!isReturnKind(input.kind)) return { ok: true, outcome: null }
  if (input.status === "DENIED") {
    return canDenyTicket(input.kind, input.legalReview)
      ? { ok: true, outcome: null }
      : { ok: false, message: WITHDRAWAL_CANNOT_BE_DENIED_MESSAGE }
  }
  if (input.status !== "RESOLVED") return { ok: true, outcome: null }
  if (
    !input.outcome ||
    !allowedReturnOutcomes(input.kind).includes(input.outcome)
  ) {
    return { ok: false, message: RETURN_OUTCOME_REQUIRED_MESSAGE }
  }
  return { ok: true, outcome: input.outcome }
}
