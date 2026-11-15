import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { toCents } from "@/features/shared/lib/shipping/strategies"

/** Refund statuses (RF34). */
export type RefundStatusKey =
  "PENDING_APPROVAL" | "PROCESSING" | "COMPLETED" | "FAILED" | "REJECTED"

/** Why the money goes back (RF34, RN07, RN18, RN22). */
export type RefundReasonKey =
  "CANCELLATION" | "WITHDRAWAL" | "EVALUATED_RETURN" | "ADJUSTMENT"

/** Whole remaining amount or part of it. */
export type RefundKindKey = "FULL" | "PARTIAL"

/** How the money goes back. */
export type RefundChannelKey = "MERCADO_PAGO" | "MANUAL_TRANSFER"

/** Payment methods of an order. */
export type OrderPaymentMethodKey = "CARD" | "PIX" | "BOLETO" | "INVOICED"

/** Label and badge tone of each refund status, in Portuguese. */
export const REFUND_STATUS: Record<
  RefundStatusKey,
  { label: string; tone: "neutral" | "progress" | "done" | "problem" }
> = {
  PENDING_APPROVAL: { label: "Aguardando aprovação", tone: "neutral" },
  PROCESSING: { label: "Em processamento", tone: "progress" },
  COMPLETED: { label: "Estornado", tone: "done" },
  FAILED: { label: "Falhou", tone: "problem" },
  REJECTED: { label: "Recusado", tone: "problem" },
}

/** Label and help text of each refund reason, in Portuguese. */
export const REFUND_REASON: Record<
  RefundReasonKey,
  { label: string; help: string }
> = {
  CANCELLATION: {
    label: "Cancelamento do pedido",
    help: "Pedido já cancelado. Para PJ, o estorno parcial desconta a multa contratual (RN07).",
  },
  WITHDRAWAL: {
    label: "Direito de arrependimento (PF)",
    help: "Compra de pessoa física pelo site, dentro do prazo de arrependimento contado do recebimento: reembolso integral, sem avaliação (RN22).",
  },
  EVALUATED_RETURN: {
    label: "Devolução após avaliação técnica",
    help: "Troca ou devolução aprovada no laudo da avaliação técnica. Informe o número do laudo.",
  },
  ADJUSTMENT: {
    label: "Ajuste de valor",
    help: "Devolução de parte do valor, por exemplo uma diferença de preço ou de frete.",
  },
}

/** Label of each refund channel, in Portuguese. */
export const REFUND_CHANNEL: Record<RefundChannelKey, string> = {
  MERCADO_PAGO: "Mercado Pago",
  MANUAL_TRANSFER: "Transferência bancária (faturado)",
}

/** Order statuses in which money may have been received. */
export const REFUNDABLE_ORDER_STATUSES: readonly OrderStatusKey[] = [
  "PAID",
  "IN_PRODUCTION",
  "SEPARATING",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
  "CANCELED",
]

/** Statuses reached after the NF-e was issued (the order is "faturado"). */
export const NFE_ISSUED_STATUSES: readonly OrderStatusKey[] = [
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
]

/** Statuses in which the goods left the store. */
export const SHIPPED_STATUSES: readonly OrderStatusKey[] = [
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
]

/** Refund statuses that hold part of the refundable amount. */
export const IN_FLIGHT_REFUND_STATUSES: readonly RefundStatusKey[] = [
  "PENDING_APPROVAL",
  "PROCESSING",
]

/** What the rules need to know about the order. */
export type RefundContext = {
  /** Order status. */
  status: OrderStatusKey
  /** Payment method of the order. */
  paymentMethod: OrderPaymentMethodKey
  /** Person type of the customer. */
  personType: "PF" | "PJ"
  /** Whether the order belongs to a corporate account. */
  corporate: boolean
  /**
   * Mercado Pago payment approved: amount, amount already refunded (also
   * outside the store) and approval date. Null when there is none.
   */
  providerPayment: {
    amount: string
    refundedAmount: string
    approvedAt: Date | null
  } | null
  /** Sum of the settled installments, for invoiced orders. */
  settledAmount: string
  /** Sum of the refunds already completed by the store. */
  completedRefunds: string
  /** Whether a refund is waiting for approval or processing. */
  hasInFlightRefund: boolean
  /** When the customer received the order, if delivered. */
  deliveredAt: Date | null
}

/** Business rule values from the settings table. */
export type RefundSettings = {
  /** Withdrawal days after the receipt (RN22). */
  withdrawalDays: number
  /** Days after the payment approval Mercado Pago accepts a refund (RN18). */
  maxDaysAfterPayment: number
}

/** A refund request after validation. */
export type RefundRequestInput = {
  /** Why the money goes back. */
  reason: RefundReasonKey
  /** Whole remaining amount or part of it. */
  kind: RefundKindKey
  /** Amount of a partial refund, decimal string. */
  amount?: string | null
}

/** Decision of the rules for a refund request. */
export type RefundDecision =
  | {
      ok: true
      /** Amount that goes back, decimal string. */
      amount: string
      /** Mercado Pago or bank transfer. */
      channel: RefundChannelKey
      /** Whether the finance team must approve it first (RN07). */
      requiresApproval: boolean
      /** Whether the order goes to "refunded" when it completes. */
      closesOrder: boolean
    }
  | { ok: false; message: string }

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cents as a decimal string with 2 places.
 *
 * @param cents - Whole cents.
 * @returns The decimal string.
 */
function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * Last moment of the withdrawal right (RN22): the receipt plus the
 * configured days.
 *
 * @param deliveredAt - When the order was delivered.
 * @param days - Withdrawal days.
 * @returns The deadline.
 */
export function withdrawalDeadline(deliveredAt: Date, days: number): Date {
  return new Date(deliveredAt.getTime() + days * DAY_MS)
}

/**
 * Whether a refund needs the finance approval first (RN07): a corporate
 * order paid in the invoiced flow, or whose NF-e was already issued.
 *
 * @param context - Order data.
 * @returns True when the approval is required.
 */
export function refundNeedsApproval(
  context: Pick<RefundContext, "corporate" | "paymentMethod" | "status">
): boolean {
  return (
    context.corporate &&
    (context.paymentMethod === "INVOICED" ||
      NFE_ISSUED_STATUSES.includes(context.status))
  )
}

/**
 * Money that may still go back, in cents: for Mercado Pago, the approved
 * amount minus what was already refunded (by the store or in the Mercado
 * Pago panel); for the invoiced flow, the installments already settled
 * minus the refunds done.
 *
 * @param context - Order data.
 * @returns The refundable cents (never negative).
 */
export function refundableCents(context: RefundContext): number {
  const completed = toCents(context.completedRefunds)
  if (context.paymentMethod === "INVOICED") {
    return Math.max(0, toCents(context.settledAmount) - completed)
  }
  if (!context.providerPayment) return 0
  const refunded = Math.max(
    completed,
    toCents(context.providerPayment.refundedAmount)
  )
  return Math.max(0, toCents(context.providerPayment.amount) - refunded)
}

/**
 * Applies the refund rules (RF34) to a request:
 * - only orders that may have received money, one refund at a time;
 * - cancellation only of a canceled order, partial only for PJ (fine
 *   of RN07);
 * - withdrawal only for PF, within the configured days of the receipt,
 *   always in full and outside the Mercado Pago deadline (RN22);
 * - return only after the goods left, adjustment only partial;
 * - through Mercado Pago only within its deadline (RN18);
 * - a partial amount above zero and below the refundable value;
 * - the finance approval for corporate invoiced orders (RN07).
 *
 * @param context - Order data.
 * @param request - Reason, kind and amount.
 * @param settings - Business rule values.
 * @param now - Reference time.
 * @returns The amount and flow, or the reason it is refused.
 */
export function decideRefund(
  context: RefundContext,
  request: RefundRequestInput,
  settings: RefundSettings,
  now: Date
): RefundDecision {
  const invoiced = context.paymentMethod === "INVOICED"
  if (!REFUNDABLE_ORDER_STATUSES.includes(context.status)) {
    return {
      ok: false,
      message: "Este pedido não tem pagamento confirmado para estornar.",
    }
  }
  if (context.hasInFlightRefund) {
    return {
      ok: false,
      message:
        "Já existe um estorno deste pedido aguardando aprovação ou em processamento.",
    }
  }
  if (!invoiced && !context.providerPayment) {
    return {
      ok: false,
      message: "Não há pagamento aprovado no Mercado Pago para estornar.",
    }
  }

  switch (request.reason) {
    case "CANCELLATION":
      if (context.status !== "CANCELED") {
        return {
          ok: false,
          message:
            "Cancele o pedido antes de estornar por cancelamento. Depois da NF-e, use devolução após avaliação.",
        }
      }
      if (request.kind === "PARTIAL" && !context.corporate) {
        return {
          ok: false,
          message:
            "O cancelamento de pedido de pessoa física é estornado por inteiro.",
        }
      }
      break
    case "WITHDRAWAL": {
      if (context.corporate || context.personType !== "PF") {
        return {
          ok: false,
          message: "O direito de arrependimento vale só para pessoa física.",
        }
      }
      if (!context.deliveredAt) {
        return {
          ok: false,
          message:
            "O pedido ainda não foi entregue. Antes da entrega, cancele o pedido.",
        }
      }
      const deadline = withdrawalDeadline(
        context.deliveredAt,
        settings.withdrawalDays
      )
      if (now.getTime() > deadline.getTime()) {
        return {
          ok: false,
          message: `O prazo de arrependimento de ${settings.withdrawalDays} dias do recebimento terminou. Use devolução após avaliação.`,
        }
      }
      if (request.kind !== "FULL") {
        return {
          ok: false,
          message: "O arrependimento gera reembolso integral.",
        }
      }
      break
    }
    case "EVALUATED_RETURN":
      if (!SHIPPED_STATUSES.includes(context.status)) {
        return {
          ok: false,
          message: "A devolução após avaliação vale para pedidos já enviados.",
        }
      }
      break
    case "ADJUSTMENT":
      if (request.kind !== "PARTIAL") {
        return { ok: false, message: "O ajuste de valor é sempre parcial." }
      }
      break
  }

  if (
    !invoiced &&
    request.reason !== "WITHDRAWAL" &&
    context.providerPayment?.approvedAt &&
    now.getTime() >
      context.providerPayment.approvedAt.getTime() +
        settings.maxDaysAfterPayment * DAY_MS
  ) {
    return {
      ok: false,
      message: `O prazo de ${settings.maxDaysAfterPayment} dias do Mercado Pago para estornar este pagamento terminou (RN18).`,
    }
  }

  const available = refundableCents(context)
  let cents = available
  if (request.kind === "PARTIAL") {
    cents = toCents(request.amount ?? "0")
    if (cents <= 0) {
      return { ok: false, message: "Informe o valor do estorno parcial." }
    }
    const limit = invoiced ? available : available - 1
    if (cents > limit) {
      return {
        ok: false,
        message:
          available === 0
            ? "Não há valor disponível para estornar."
            : invoiced
              ? `O estorno parcial do faturado vai até o valor já recebido (R$ ${fromCents(available).replace(".", ",")}).`
              : `O estorno parcial deve ser menor que o valor disponível (R$ ${fromCents(available).replace(".", ",")}). Para devolver tudo, escolha estorno total.`,
      }
    }
  } else if (!invoiced && available === 0) {
    return { ok: false, message: "Não há valor disponível para estornar." }
  }

  return {
    ok: true,
    amount: fromCents(cents),
    channel: invoiced ? "MANUAL_TRANSFER" : "MERCADO_PAGO",
    requiresApproval: refundNeedsApproval(context),
    closesOrder: request.kind === "FULL",
  }
}

/**
 * Payment status after a refund of a Mercado Pago payment.
 *
 * @param amount - Payment amount, decimal string.
 * @param refunded - Total refunded after this refund, decimal string.
 * @returns "REFUNDED" when nothing is left, otherwise "PARTIALLY_REFUNDED".
 */
export function paymentStatusAfterRefund(
  amount: string,
  refunded: string
): "REFUNDED" | "PARTIALLY_REFUNDED" {
  return toCents(refunded) >= toCents(amount)
    ? "REFUNDED"
    : "PARTIALLY_REFUNDED"
}
