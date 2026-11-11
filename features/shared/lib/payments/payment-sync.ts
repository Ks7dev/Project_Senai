import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  mapProviderStatus,
  type PaymentStatusKey,
  type ProviderPayment,
} from "@/features/shared/lib/mercadopago/mercadopago"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { toCents } from "@/features/shared/lib/shipping/strategies"

/** Statuses a payment never leaves for "pending" again. */
const SETTLED: readonly PaymentStatusKey[] = [
  "APPROVED",
  "REJECTED",
  "CANCELED",
  "EXPIRED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
]

/** Status detail recorded when the charged amount is not the order's. */
export const AMOUNT_MISMATCH_DETAIL = "amount_mismatch"

/** Result of applying a Mercado Pago payment to the store. */
export type PaymentSyncResult = {
  /** Our payment row id, or null when the payment is not ours. */
  paymentRowId: string | null
  /** Order id, or null. */
  orderId: string | null
  /** Stored payment status after the sync. */
  status: PaymentStatusKey | null
  /** Order status after the sync. */
  orderStatus: OrderStatusKey | null
  /** Whether anything changed (false for a repeated notification). */
  changed: boolean
}

/**
 * Decides the stored status from the provider answer. Only "approved"
 * with the exact amount in BRL confirms (RN13); a different amount is
 * kept pending for the finance team. A settled payment never goes back
 * to pending, so a late or repeated notification cannot undo it.
 *
 * @param current - Stored status.
 * @param provider - Provider payment.
 * @param expectedAmount - Amount of our payment row, decimal string.
 * @returns The status to store and the detail to record.
 */
export function nextPaymentStatus(
  current: PaymentStatusKey,
  provider: Pick<
    ProviderPayment,
    "status" | "statusDetail" | "amount" | "currency" | "refundedAmount"
  >,
  expectedAmount: string
): { status: PaymentStatusKey; statusDetail: string | null } {
  let status = mapProviderStatus(
    provider.status,
    provider.refundedAmount,
    provider.amount
  )
  let statusDetail = provider.statusDetail
  if (
    status === "APPROVED" &&
    (provider.currency !== "BRL" ||
      toCents(provider.amount) !== toCents(expectedAmount))
  ) {
    status = "PENDING"
    statusDetail = AMOUNT_MISMATCH_DETAIL
  }
  if (status === "PENDING" && SETTLED.includes(current)) {
    return { status: current, statusDetail }
  }
  return { status, statusDetail }
}

/**
 * Applies a Mercado Pago payment to our payment row and to the order,
 * inside the caller's transaction. Used by the checkout right after
 * creating the payment, by the webhook and by the reconciliation, so
 * the three paths behave the same (RF30, RN13):
 * 1. finds our row by the Mercado Pago id or by the external reference;
 * 2. locks the order and then the payment (always in this order, so
 *    concurrent notifications never deadlock);
 * 3. stores the payment_id, status and detail (RF32);
 * 4. moves the order to "paid" only with "approved" (RN13), which writes
 *    off the stock reserved at checkout (RF43);
 * 5. writes the audit log of the change (RNF12).
 * Applying the same answer twice changes nothing (idempotent).
 *
 * @param tx - Prisma transaction.
 * @param provider - Payment read from Mercado Pago.
 * @param options - Reference time and who triggered it (null = system).
 * @returns What changed.
 */
export async function applyProviderPayment(
  tx: Prisma.TransactionClient,
  provider: ProviderPayment,
  options: { now?: Date; userId?: string | null } = {}
): Promise<PaymentSyncResult> {
  const found = await tx.payment.findFirst({
    where: {
      OR: [
        { paymentId: provider.id },
        ...(provider.externalReference
          ? [{ id: provider.externalReference, paymentId: null }]
          : []),
      ],
    },
    select: { id: true, orderId: true },
  })
  if (!found) {
    logger.warn("mercadopago payment not found in the store", {
      paymentId: provider.id,
    })
    return {
      paymentRowId: null,
      orderId: null,
      status: null,
      orderStatus: null,
      changed: false,
    }
  }

  // Justified raw queries: Prisma has no row lock
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${found.orderId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM payments WHERE id = ${found.id} FOR UPDATE`
  const row = await tx.payment.findUniqueOrThrow({
    where: { id: found.id },
    select: {
      id: true,
      orderId: true,
      status: true,
      providerStatus: true,
      statusDetail: true,
      paymentId: true,
      amount: true,
      refundedAmount: true,
      paidAt: true,
      order: { select: { status: true, number: true } },
    },
  })

  const now = options.now ?? new Date()
  const next = nextPaymentStatus(row.status, provider, row.amount.toFixed(2))
  const refundedAmount =
    next.status === "REFUNDED" || next.status === "PARTIALLY_REFUNDED"
      ? provider.refundedAmount
      : row.refundedAmount.toFixed(2)
  const unchanged =
    row.paymentId === provider.id &&
    row.status === next.status &&
    row.providerStatus === provider.status &&
    row.statusDetail === next.statusDetail &&
    row.refundedAmount.toFixed(2) === refundedAmount
  let orderStatus = row.order.status as OrderStatusKey
  if (unchanged) {
    return {
      paymentRowId: row.id,
      orderId: row.orderId,
      status: row.status,
      orderStatus,
      changed: false,
    }
  }

  const approvedNow = next.status === "APPROVED" && row.status !== "APPROVED"
  await tx.payment.update({
    where: { id: row.id },
    data: {
      paymentId: provider.id,
      status: next.status,
      providerStatus: provider.status.slice(0, 64),
      statusDetail: next.statusDetail?.slice(0, 64) ?? null,
      refundedAmount,
      ...(approvedNow ? { paidAt: provider.approvedAt ?? now } : {}),
    },
  })

  if (approvedNow) {
    if (orderStatus === "AWAITING_PAYMENT") {
      const transition = await transitionOrder(tx, {
        orderId: row.orderId,
        to: "PAID",
        changedById: options.userId ?? null,
        note: "Pagamento aprovado pelo Mercado Pago.",
        expectedFrom: ["AWAITING_PAYMENT"],
        now,
      })
      orderStatus = transition.to
    } else {
      // Paid after the order left the checkout (e.g. Pix paid after it
      // expired): the finance team refunds it (#59)
      logger.warn("payment approved for an order not awaiting payment", {
        orderId: row.orderId,
        orderStatus,
      })
    }
  }
  if (next.statusDetail === AMOUNT_MISMATCH_DETAIL) {
    logger.error("mercadopago amount does not match the order", {
      orderId: row.orderId,
    })
  }

  await writeAudit(tx, {
    userId: options.userId ?? null,
    action: "payment.status_sync",
    entity: "payment",
    entityId: row.id,
    before: {
      status: row.status,
      providerStatus: row.providerStatus,
      paymentId: row.paymentId,
    },
    after: {
      status: next.status,
      providerStatus: provider.status,
      statusDetail: next.statusDetail,
      paymentId: provider.id,
      orderStatus,
    },
  })
  return {
    paymentRowId: row.id,
    orderId: row.orderId,
    status: next.status,
    orderStatus,
    changed: true,
  }
}
