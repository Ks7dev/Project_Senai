"use server"

import type { Prisma } from "@/generated/prisma/client"
import { refundCompletedEmail } from "@/emails/templates"
import {
  approveRefundSchema,
  refundOrderLookupSchema,
  refundRequestSchema,
  refundsFilterSchema,
  rejectRefundSchema,
  retryRefundSchema,
  type ApproveRefundInput,
  type RefundFilter,
  type RefundOrderLookupInput,
  type RefundRequestInput,
  type RefundsFilterInput,
  type RejectRefundInput,
  type RetryRefundInput,
} from "@/features/finance/refunds/schema/refund-schema"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  createMercadoPagoRefund,
  MercadoPagoError,
  type ProviderRefund,
} from "@/features/shared/lib/mercadopago/mercadopago"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import {
  decideRefund,
  IN_FLIGHT_REFUND_STATUSES,
  paymentStatusAfterRefund,
  refundableCents,
  refundNeedsApproval,
  withdrawalDeadline,
  type OrderPaymentMethodKey,
  type RefundChannelKey,
  type RefundContext,
  type RefundKindKey,
  type RefundReasonKey,
  type RefundSettings,
  type RefundStatusKey,
} from "@/features/shared/lib/refunds/refund-rules"
import { enforcePersistentRateLimits } from "@/features/shared/lib/rate-limit/persistent-limit"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { toCents } from "@/features/shared/lib/shipping/strategies"
import { WITHDRAWAL_DAYS_SETTING } from "@/features/shared/lib/support/return-policy"

/** Setting with the Mercado Pago refund deadline (RN18). */
const MAX_DAYS_KEY = "refund.max_days_after_payment"

/** How many refunds the list shows. */
const LIST_LIMIT = 100

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/** Order data read to decide a refund. */
const orderRefundSelect = {
  id: true,
  number: true,
  status: true,
  paymentMethod: true,
  total: true,
  organizationId: true,
  user: { select: { name: true, email: true, personType: true } },
  organization: { select: { name: true } },
  shipment: { select: { deliveredAt: true } },
  payments: {
    where: {
      status: { in: ["APPROVED", "PARTIALLY_REFUNDED", "REFUNDED"] },
      paymentId: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: {
      id: true,
      paymentId: true,
      amount: true,
      refundedAmount: true,
      paidAt: true,
    },
  },
  receivables: { where: { status: "PAID" }, select: { amount: true } },
  refunds: { select: { id: true, status: true, amount: true } },
  // First withdrawal ticket: the moment the customer used the right (RN22)
  supportTickets: {
    where: { kind: "WITHDRAWAL", status: { not: "DENIED" } },
    orderBy: { createdAt: "asc" },
    take: 1,
    select: { createdAt: true },
  },
} satisfies Prisma.OrderSelect

type OrderForRefund = Prisma.OrderGetPayload<{
  select: typeof orderRefundSelect
}>

/** The order shown in the refund form, with what may go back. */
export type RefundOrderSummary = {
  /** Order id. */
  id: string
  /** Readable number. */
  number: string
  /** Order status label, in Portuguese. */
  statusLabel: string
  /** Customer name. */
  customer: string
  /** Company of a corporate order. */
  company: string | null
  /** Person type of the customer. */
  personType: "PF" | "PJ"
  /** Payment method. */
  paymentMethod: OrderPaymentMethodKey
  /** Order total, decimal string. */
  total: string
  /** Mercado Pago payment id (RF32), when paid there. */
  providerPaymentId: string | null
  /** Money received: approved payment or settled installments. */
  received: string
  /** Already refunded, decimal string. */
  refunded: string
  /** What may still go back, decimal string. */
  refundable: string
  /** Last day of the withdrawal right, ISO string, for PF orders. */
  withdrawalUntil: string | null
  /** Whether the refund waits for the finance approval (RN07). */
  requiresApproval: boolean
  /** How the money goes back. */
  channel: RefundChannelKey
  /** Whether a refund is already waiting or processing. */
  hasInFlightRefund: boolean
}

/** A refund in the back office list. */
export type RefundRow = {
  /** Refund id. */
  id: string
  /** Order id. */
  orderId: string
  /** Readable order number. */
  orderNumber: string
  /** Company or customer. */
  customer: string
  /** Full or partial. */
  kind: RefundKindKey
  /** Reason. */
  reason: RefundReasonKey
  /** Mercado Pago or bank transfer. */
  channel: RefundChannelKey
  /** Amount, decimal string. */
  amount: string
  /** Status. */
  status: RefundStatusKey
  /** Justification of the request. */
  note: string
  /** Why it failed, safe to show. */
  failureReason: string | null
  /** Who asked for it. */
  requestedBy: string
  /** When it was asked, ISO string. */
  requestedAt: string
  /** Who approved or refused it. */
  decidedBy: string | null
  /** When it was decided, ISO string. */
  decidedAt: string | null
  /** Approval or refusal note. */
  decisionNote: string | null
  /** When the money went back, ISO string. */
  completedAt: string | null
  /** Mercado Pago refund id. */
  providerRefundId: string | null
}

/** What the refunds page shows. */
export type RefundsData = {
  /** Refunds of the filter, newest first. */
  rows: RefundRow[]
  /** How many wait for the finance approval. */
  pendingApproval: number
  /** Whether the user may approve or refuse (`credit:approve`). */
  canApprove: boolean
}

/** Outcome of a refund request, approval or retry. */
export type RefundOutcome = {
  /** Refund id. */
  refundId: string
  /** Status after the step. */
  status: RefundStatusKey
  /** What happened, in Portuguese. */
  message: string
}

/**
 * Refund business values from the settings table (RN18, RN22).
 *
 * @param client - Prisma client or transaction.
 * @returns The settings.
 */
async function loadRefundSettings(
  client: Pick<Prisma.TransactionClient, "setting">
): Promise<RefundSettings> {
  const [withdrawalDays, maxDaysAfterPayment] = await Promise.all([
    getNumberSetting(WITHDRAWAL_DAYS_SETTING, client),
    getNumberSetting(MAX_DAYS_KEY, client),
  ])
  return { withdrawalDays, maxDaysAfterPayment }
}

/**
 * Sum of decimal amounts, in cents.
 *
 * @param values - Decimal-like values.
 * @returns The cents.
 */
function sumCents(
  values: Array<{ toFixed: (digits: number) => string }>
): number {
  return values.reduce<number>(
    (total, value) => total + toCents(value.toFixed(2)),
    0
  )
}

/**
 * Builds the rule context from the order.
 *
 * @param order - Order with its payment, installments and refunds.
 * @param ignoreRefundId - Refund left out of the in-flight check (the
 * one being approved).
 * @returns The context.
 */
function toContext(
  order: OrderForRefund,
  ignoreRefundId?: string
): RefundContext {
  const payment = order.payments[0]
  const others = order.refunds.filter((refund) => refund.id !== ignoreRefundId)
  return {
    status: order.status as OrderStatusKey,
    paymentMethod: order.paymentMethod as OrderPaymentMethodKey,
    personType: order.user.personType,
    corporate: order.organizationId !== null,
    providerPayment: payment
      ? {
          amount: payment.amount.toFixed(2),
          refundedAmount: payment.refundedAmount.toFixed(2),
          approvedAt: payment.paidAt,
        }
      : null,
    settledAmount: (
      sumCents(order.receivables.map((r) => r.amount)) / 100
    ).toFixed(2),
    completedRefunds: (
      sumCents(
        others.filter((r) => r.status === "COMPLETED").map((r) => r.amount)
      ) / 100
    ).toFixed(2),
    hasInFlightRefund: others.some((refund) =>
      IN_FLIGHT_REFUND_STATUSES.includes(refund.status)
    ),
    deliveredAt: order.shipment?.deliveredAt ?? null,
    withdrawalRequestedAt: order.supportTickets?.[0]?.createdAt ?? null,
  }
}

/**
 * Finds an order by its number and shows what may be refunded (RF34):
 * money received, already refunded, the withdrawal deadline of a PF
 * order (RN22) and whether the finance approval is needed (RN07).
 * Requires `payment:refund`; the user comes from the session.
 *
 * @param input - Order number.
 * @returns `{ success: true, order }` or `{ success: false, error }`.
 */
export async function findRefundOrder(
  input: RefundOrderLookupInput
): Promise<ActionResult<{ order: RefundOrderSummary }>> {
  try {
    const parsed = refundOrderLookupSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Número inválido.",
        "invalid"
      )
    }
    await requirePermission("payment:refund")
    const order = await prisma.order.findUnique({
      where: { number: parsed.data.number },
      select: orderRefundSelect,
    })
    if (!order) throw new AppError("Pedido não encontrado.", "not_found")
    const settings = await loadRefundSettings(prisma)
    const context = toContext(order)
    const invoiced = context.paymentMethod === "INVOICED"
    const payment = order.payments[0]
    const received = invoiced
      ? context.settledAmount
      : (payment?.amount.toFixed(2) ?? "0.00")
    const refundable = (refundableCents(context) / 100).toFixed(2)
    return {
      success: true,
      order: {
        id: order.id,
        number: order.number,
        statusLabel: ORDER_STATUS[context.status].label,
        customer: order.user.name,
        company: order.organization?.name ?? null,
        personType: context.personType,
        paymentMethod: context.paymentMethod,
        total: order.total.toFixed(2),
        providerPaymentId: payment?.paymentId ?? null,
        received,
        refunded: ((toCents(received) - toCents(refundable)) / 100).toFixed(2),
        refundable,
        withdrawalUntil:
          !context.corporate &&
          context.personType === "PF" &&
          context.deliveredAt
            ? withdrawalDeadline(
                context.deliveredAt,
                settings.withdrawalDays
              ).toISOString()
            : null,
        requiresApproval: refundNeedsApproval(context),
        channel: invoiced ? "MANUAL_TRANSFER" : "MERCADO_PAGO",
        hasInFlightRefund: context.hasInFlightRefund,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "findRefundOrder" })
  }
}

/**
 * Where clause of a refund list filter.
 *
 * @param filter - Chosen filter.
 * @returns The where clause.
 */
function filterWhere(filter: RefundFilter): Prisma.RefundWhereInput {
  switch (filter) {
    case "PENDING_APPROVAL":
    case "PROCESSING":
    case "COMPLETED":
      return { status: filter }
    case "FAILED":
      return { status: { in: ["FAILED", "REJECTED"] } }
    default:
      return {}
  }
}

/**
 * Lists the refunds with their status, who asked, who decided and the
 * Mercado Pago refund id (RF34). Requires `payment:refund`.
 *
 * @param input - Status filter.
 * @returns `{ success: true, refunds }` or `{ success: false, error }`.
 */
export async function listRefunds(
  input: RefundsFilterInput = {}
): Promise<ActionResult<{ refunds: RefundsData }>> {
  try {
    const parsed = refundsFilterSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Filtro inválido.", "invalid")
    const { permissions } = await requirePermission("payment:refund")
    const [rows, pendingApproval] = await Promise.all([
      prisma.refund.findMany({
        where: filterWhere(parsed.data.filter),
        orderBy: { createdAt: "desc" },
        take: LIST_LIMIT,
        select: {
          id: true,
          orderId: true,
          kind: true,
          reason: true,
          channel: true,
          amount: true,
          status: true,
          note: true,
          failureReason: true,
          providerRefundId: true,
          createdAt: true,
          decidedAt: true,
          decisionNote: true,
          completedAt: true,
          requestedBy: { select: { name: true } },
          decidedBy: { select: { name: true } },
          order: {
            select: {
              number: true,
              user: { select: { name: true } },
              organization: { select: { name: true } },
            },
          },
        },
      }),
      prisma.refund.count({ where: { status: "PENDING_APPROVAL" } }),
    ])
    return {
      success: true,
      refunds: {
        rows: rows.map((row) => ({
          id: row.id,
          orderId: row.orderId,
          orderNumber: row.order.number,
          customer: row.order.organization?.name ?? row.order.user.name,
          kind: row.kind,
          reason: row.reason,
          channel: row.channel,
          amount: row.amount.toFixed(2),
          status: row.status,
          note: row.note,
          failureReason: row.failureReason,
          requestedBy: row.requestedBy.name,
          requestedAt: row.createdAt.toISOString(),
          decidedBy: row.decidedBy?.name ?? null,
          decidedAt: row.decidedAt?.toISOString() ?? null,
          decisionNote: row.decisionNote,
          completedAt: row.completedAt?.toISOString() ?? null,
          providerRefundId: row.providerRefundId,
        })),
        pendingApproval,
        canApprove: hasPermission(permissions, "credit:approve"),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "listRefunds" })
  }
}

/**
 * Completes a refund in the caller's transaction: locks the refund, the
 * order and the payment (in this order), records the amount on the
 * Mercado Pago payment, moves the order to "refunded" when nothing is
 * left (which cancels the open invoiced installments), writes the audit
 * log (RNF12) and queues the customer e-mail. Does nothing for a refund
 * that is not processing (idempotent).
 *
 * @param tx - Prisma transaction.
 * @param input - Refund, Mercado Pago refund id, user and time.
 * @returns True when the refund was completed now.
 */
async function completeRefund(
  tx: Prisma.TransactionClient,
  input: {
    refundId: string
    providerRefundId: string | null
    userId: string
    now: Date
  }
): Promise<boolean> {
  // Justified raw queries: Prisma has no row lock
  await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${input.refundId} FOR UPDATE`
  const refund = await tx.refund.findUnique({
    where: { id: input.refundId },
    select: {
      id: true,
      status: true,
      kind: true,
      reason: true,
      channel: true,
      amount: true,
      paymentRowId: true,
      order: {
        select: {
          id: true,
          number: true,
          total: true,
          status: true,
          user: { select: { name: true, email: true } },
        },
      },
    },
  })
  if (!refund || refund.status !== "PROCESSING") return false
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${refund.order.id} FOR UPDATE`

  let closesOrder = refund.kind === "FULL"
  if (refund.paymentRowId) {
    await tx.$queryRaw`SELECT id FROM payments WHERE id = ${refund.paymentRowId} FOR UPDATE`
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: refund.paymentRowId },
      select: { amount: true, refundedAmount: true },
    })
    const completed = await tx.refund.aggregate({
      where: { paymentRowId: refund.paymentRowId, status: "COMPLETED" },
      _sum: { amount: true },
    })
    const refundedCents = Math.max(
      toCents(payment.refundedAmount.toFixed(2)),
      toCents(completed._sum.amount?.toFixed(2) ?? "0") +
        toCents(refund.amount.toFixed(2))
    )
    const refunded = (refundedCents / 100).toFixed(2)
    const status = paymentStatusAfterRefund(payment.amount.toFixed(2), refunded)
    await tx.payment.update({
      where: { id: refund.paymentRowId },
      data: { refundedAmount: refunded, status },
    })
    closesOrder = closesOrder || status === "REFUNDED"
  }

  await tx.refund.update({
    where: { id: refund.id },
    data: {
      status: "COMPLETED",
      providerRefundId: input.providerRefundId,
      failureReason: null,
      completedAt: input.now,
    },
  })
  const fromStatus = refund.order.status as OrderStatusKey
  let orderStatus: OrderStatusKey = fromStatus
  if (closesOrder && fromStatus !== "REFUNDED") {
    const transition = await transitionOrder(tx, {
      orderId: refund.order.id,
      to: "REFUNDED",
      changedById: input.userId,
      note: `Estorno ${refund.kind === "FULL" ? "total" : "parcial"} de ${brl.format(Number(refund.amount))}.`,
      now: input.now,
    })
    orderStatus = transition.to
  }
  await writeAudit(tx, {
    userId: input.userId,
    action: "refund.complete",
    entity: "refund",
    entityId: refund.id,
    before: { status: "PROCESSING", orderStatus: fromStatus },
    after: {
      status: "COMPLETED",
      orderId: refund.order.id,
      amount: refund.amount.toFixed(2),
      kind: refund.kind,
      reason: refund.reason,
      channel: refund.channel,
      providerRefundId: input.providerRefundId,
      orderStatus,
    },
  })
  await enqueueEmail(tx, {
    to: refund.order.user.email,
    ...refundCompletedEmail({
      name: refund.order.user.name,
      number: refund.order.number,
      total: refund.order.total.toFixed(2),
      url: `${siteUrl()}/conta/pedidos/${refund.order.id}`,
      amount: refund.amount.toFixed(2),
      full: closesOrder,
      channel: refund.channel,
    }),
  })
  return true
}

/**
 * Marks a refund as failed with a safe reason, audited (RNF12). The
 * amount is free again for a new request.
 *
 * @param input - Refund, reason, user and time.
 */
async function failRefund(input: {
  refundId: string
  reason: string
  userId: string
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const result = await tx.refund.updateMany({
      where: { id: input.refundId, status: "PROCESSING" },
      data: { status: "FAILED", failureReason: input.reason.slice(0, 255) },
    })
    if (result.count === 0) return
    await writeAudit(tx, {
      userId: input.userId,
      action: "refund.fail",
      entity: "refund",
      entityId: input.refundId,
      before: { status: "PROCESSING" },
      after: { status: "FAILED", reason: input.reason },
    })
  })
}

/**
 * Message of a Mercado Pago error that ends the refund.
 *
 * @param error - The error.
 * @returns The reason, in Portuguese.
 */
function providerFailureReason(error: MercadoPagoError): string {
  switch (error.kind) {
    case "not_configured":
      return "O Mercado Pago não está configurado neste ambiente."
    case "not_found":
      return "O pagamento não foi encontrado no Mercado Pago."
    default:
      return "O Mercado Pago recusou o estorno. Confira o prazo e o valor disponível."
  }
}

/**
 * Sends a processing refund: a bank transfer refund (invoiced) is
 * recorded at once; a Mercado Pago refund calls the API outside any
 * transaction with the refund id as idempotency key and then completes
 * it. With no answer from Mercado Pago it stays processing for a new
 * attempt; a refusal marks it as failed.
 *
 * @param refundId - Refund id.
 * @param userId - User from the session.
 * @returns The outcome.
 */
async function processRefund(
  refundId: string,
  userId: string
): Promise<RefundOutcome> {
  const refund = await prisma.refund.findUnique({
    where: { id: refundId },
    select: {
      status: true,
      channel: true,
      amount: true,
      payment: { select: { paymentId: true } },
    },
  })
  if (!refund) throw new AppError("Estorno não encontrado.", "not_found")
  if (refund.status !== "PROCESSING") {
    return {
      refundId,
      status: refund.status,
      message: "Este estorno não está em processamento.",
    }
  }

  let provider: ProviderRefund | null = null
  if (refund.channel === "MERCADO_PAGO") {
    try {
      if (!refund.payment?.paymentId) throw new MercadoPagoError("not_found")
      provider = await createMercadoPagoRefund({
        paymentId: refund.payment.paymentId,
        amount: refund.amount.toFixed(2),
        idempotencyKey: refundId,
      })
    } catch (error) {
      if (!(error instanceof MercadoPagoError)) throw error
      logger.warn("refund not sent", { refundId, kind: error.kind })
      if (error.kind === "unavailable") {
        await prisma.refund.update({
          where: { id: refundId },
          data: {
            failureReason:
              "O Mercado Pago não respondeu. Tente de novo em instantes.",
          },
        })
        return {
          refundId,
          status: "PROCESSING",
          message:
            "O Mercado Pago não respondeu. O estorno ficou em processamento; tente de novo em instantes.",
        }
      }
      const reason = providerFailureReason(error)
      await failRefund({ refundId, reason, userId })
      return { refundId, status: "FAILED", message: reason }
    }
    if (provider.status === "rejected") {
      const reason = "O Mercado Pago recusou o estorno."
      await failRefund({ refundId, reason, userId })
      return { refundId, status: "FAILED", message: reason }
    }
    if (provider.status !== "approved") {
      await prisma.refund.update({
        where: { id: refundId },
        data: {
          providerRefundId: provider.id,
          failureReason:
            "O Mercado Pago ainda processa o estorno. Consulte de novo mais tarde.",
        },
      })
      return {
        refundId,
        status: "PROCESSING",
        message:
          "O Mercado Pago recebeu o estorno e ainda o processa. Consulte de novo mais tarde.",
      }
    }
  }

  const now = new Date()
  await prisma.$transaction((tx) =>
    completeRefund(tx, {
      refundId,
      providerRefundId: provider?.id ?? null,
      userId,
      now,
    })
  )
  return {
    refundId,
    status: "COMPLETED",
    message:
      refund.channel === "MERCADO_PAGO"
        ? `Estorno de ${brl.format(Number(refund.amount))} feito no Mercado Pago.`
        : `Estorno de ${brl.format(Number(refund.amount))} registrado. Faça a transferência para a empresa.`,
  }
}

/**
 * Asks for a full or partial refund (RF34). Requires `payment:refund`,
 * with the user from the session, and counts the request against the
 * per-user limit (#175). In one transaction it locks the
 * order, applies the rules (RN07, RN18, RN22: amount, deadline,
 * withdrawal, one refund at a time), records the request and writes
 * the audit log (RNF12). A corporate invoiced order waits for the
 * finance approval; any other refund is sent at once.
 *
 * @param input - Order, reason, kind, partial amount and justification.
 * @returns `{ success: true, refundId, status, message }` or
 * `{ success: false, error }`.
 */
export async function requestRefund(
  input: RefundRequestInput
): Promise<ActionResult<RefundOutcome>> {
  try {
    const parsed = refundRequestSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o estorno.",
        "invalid"
      )
    }
    const data = parsed.data
    const { user } = await requirePermission("payment:refund")
    await enforcePersistentRateLimits(
      [{ scope: "refund.user", subject: user.id }],
      { userId: user.id, action: "requestRefund", entityId: data.orderId }
    )
    const now = new Date()

    const created = await prisma.$transaction(async (tx) => {
      // Justified raw query: Prisma has no row lock
      const locked = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM orders WHERE id = ${data.orderId} FOR UPDATE`
      if (locked.length === 0) {
        throw new AppError("Pedido não encontrado.", "not_found")
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: data.orderId },
        select: orderRefundSelect,
      })
      const decision = decideRefund(
        toContext(order),
        { reason: data.reason, kind: data.kind, amount: data.amount },
        await loadRefundSettings(tx),
        now
      )
      if (!decision.ok) throw new AppError(decision.message, "refused")
      const status: RefundStatusKey = decision.requiresApproval
        ? "PENDING_APPROVAL"
        : "PROCESSING"
      const refund = await tx.refund.create({
        data: {
          orderId: order.id,
          paymentRowId:
            decision.channel === "MERCADO_PAGO"
              ? (order.payments[0]?.id ?? null)
              : null,
          kind: data.kind,
          reason: data.reason,
          channel: decision.channel,
          amount: decision.amount,
          status,
          note: data.note,
          requestedById: user.id,
          createdAt: now,
        },
        select: { id: true },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "refund.request",
        entity: "refund",
        entityId: refund.id,
        after: {
          orderId: order.id,
          kind: data.kind,
          reason: data.reason,
          channel: decision.channel,
          amount: decision.amount,
          status,
          note: data.note,
        },
      })
      return { refundId: refund.id, status, number: order.number }
    })

    if (created.status === "PENDING_APPROVAL") {
      return {
        success: true,
        refundId: created.refundId,
        status: created.status,
        message: `Estorno do pedido ${created.number} enviado para a aprovação do financeiro.`,
      }
    }
    return {
      success: true,
      ...(await processRefund(created.refundId, user.id)),
    }
  } catch (error) {
    return toActionError(error, { action: "requestRefund" })
  }
}

/**
 * Approves a refund waiting for the finance team (RN07) and sends it.
 * Requires `credit:approve`, with the user from the session. Checks
 * again that the amount is still available, records who approved, when
 * and why, and writes the audit log (RNF12).
 *
 * @param input - Refund and an optional note.
 * @returns `{ success: true, refundId, status, message }` or
 * `{ success: false, error }`.
 */
export async function approveRefund(
  input: ApproveRefundInput
): Promise<ActionResult<RefundOutcome>> {
  try {
    const parsed = approveRefundSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Estorno inválido.",
        "invalid"
      )
    }
    const { refundId, note } = parsed.data
    const { user } = await requirePermission("credit:approve")
    const now = new Date()

    await prisma.$transaction(async (tx) => {
      // Justified raw query: Prisma has no row lock
      await tx.$queryRaw`SELECT id FROM refunds WHERE id = ${refundId} FOR UPDATE`
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        select: { status: true, amount: true, orderId: true },
      })
      if (!refund) throw new AppError("Estorno não encontrado.", "not_found")
      if (refund.status !== "PENDING_APPROVAL") {
        throw new AppError(
          "Este estorno não aguarda aprovação. Atualize a página.",
          "not_pending"
        )
      }
      const order = await tx.order.findUniqueOrThrow({
        where: { id: refund.orderId },
        select: orderRefundSelect,
      })
      const available = refundableCents(toContext(order, refundId))
      const invoiced = order.paymentMethod === "INVOICED"
      if (
        toCents(refund.amount.toFixed(2)) > available ||
        (!invoiced && available === 0)
      ) {
        throw new AppError(
          "O valor disponível para estorno mudou. Recuse este pedido e faça um novo.",
          "amount_changed"
        )
      }
      await tx.refund.update({
        where: { id: refundId },
        data: {
          status: "PROCESSING",
          decidedById: user.id,
          decidedAt: now,
          decisionNote: note || null,
        },
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "refund.approve",
        entity: "refund",
        entityId: refundId,
        before: { status: "PENDING_APPROVAL" },
        after: {
          status: "PROCESSING",
          amount: refund.amount.toFixed(2),
          note: note || null,
        },
      })
    })
    return { success: true, ...(await processRefund(refundId, user.id)) }
  } catch (error) {
    return toActionError(error, { action: "approveRefund" })
  }
}

/**
 * Refuses a refund waiting for the finance team (RN07), with the
 * reason. Requires `credit:approve`; audited (RNF12).
 *
 * @param input - Refund and the reason.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function rejectRefund(
  input: RejectRefundInput
): Promise<ActionResult> {
  try {
    const parsed = rejectRefundSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Informe o motivo da recusa.",
        "invalid"
      )
    }
    const { refundId, note } = parsed.data
    const { user } = await requirePermission("credit:approve")
    const now = new Date()
    await prisma.$transaction(async (tx) => {
      const result = await tx.refund.updateMany({
        where: { id: refundId, status: "PENDING_APPROVAL" },
        data: {
          status: "REJECTED",
          decidedById: user.id,
          decidedAt: now,
          decisionNote: note,
        },
      })
      if (result.count === 0) {
        throw new AppError(
          "Este estorno não aguarda aprovação. Atualize a página.",
          "not_pending"
        )
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "refund.reject",
        entity: "refund",
        entityId: refundId,
        before: { status: "PENDING_APPROVAL" },
        after: { status: "REJECTED", note },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "rejectRefund" })
  }
}

/**
 * Sends again a refund still processing (Mercado Pago did not answer or
 * was still processing it). The same idempotency key makes the retry
 * safe: Mercado Pago never refunds twice. Requires `payment:refund`;
 * counted against the same per-user limit as the request (#175).
 *
 * @param input - Refund id.
 * @returns `{ success: true, refundId, status, message }` or
 * `{ success: false, error }`.
 */
export async function retryRefund(
  input: RetryRefundInput
): Promise<ActionResult<RefundOutcome>> {
  try {
    const parsed = retryRefundSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Estorno inválido.", "invalid")
    const { user } = await requirePermission("payment:refund")
    await enforcePersistentRateLimits(
      [{ scope: "refund.user", subject: user.id }],
      {
        userId: user.id,
        action: "retryRefund",
        entityId: parsed.data.refundId,
      }
    )
    return {
      success: true,
      ...(await processRefund(parsed.data.refundId, user.id)),
    }
  } catch (error) {
    return toActionError(error, { action: "retryRefund" })
  }
}
