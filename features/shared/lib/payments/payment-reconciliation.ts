import "server-only"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  findMercadoPagoPaymentByReference,
  getMercadoPagoPayment,
  MercadoPagoError,
  mercadoPagoConfig,
  type ProviderPayment,
} from "@/features/shared/lib/mercadopago/mercadopago"
import {
  applyProviderPayment,
  type PaymentSyncResult,
} from "@/features/shared/lib/payments/payment-sync"

/** How many pending payments one reconciliation round reads at most. */
const RECONCILE_BATCH = 50

/** Age a pending payment needs before the reconciliation reads it. */
const RECONCILE_MIN_AGE_MS = 60_000

/**
 * Age after which an attempt Mercado Pago never registered (creation
 * call without answer and nothing found by the external reference) is
 * given up, so the customer may pay again.
 */
const UNREGISTERED_GIVE_UP_MS = 15 * 60_000

/** Result of a webhook notification. */
export type NotificationResult =
  { status: "processed"; sync: PaymentSyncResult } | { status: "duplicate" }

/**
 * Processes a Mercado Pago payment notification (RF30, #57), already
 * authenticated by the signature. Idempotent: the `x-request-id` is
 * stored with a unique index and a notification already processed is
 * skipped. The payment is always read again from
 * `GET /v1/payments/{id}`, never taken from the notification body, and
 * applied through the same sync as the checkout, which confirms the
 * order only with "approved" (RN13). A failure is thrown so the route
 * answers 500 and Mercado Pago retries.
 *
 * @param input - Request id, topic and payment id of the notification.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns Whether it was processed or a repeated delivery.
 */
export async function processPaymentNotification(
  input: { requestId: string; topic: string; resourceId: string },
  fetcher: typeof fetch = fetch
): Promise<NotificationResult> {
  const notification = await prisma.paymentNotification.upsert({
    where: { requestId: input.requestId },
    create: {
      requestId: input.requestId,
      topic: input.topic.slice(0, 40),
      resourceId: input.resourceId.slice(0, 64),
      attempts: 1,
    },
    update: { attempts: { increment: 1 } },
    select: { id: true, processedAt: true },
  })
  if (notification.processedAt) return { status: "duplicate" }

  const provider = await getMercadoPagoPayment(input.resourceId, fetcher)
  const sync = await prisma.$transaction(async (tx) => {
    // Lock the notification (justified raw query: Prisma has no row lock),
    // so two deliveries of the same notification apply it once
    const rows = await tx.$queryRaw<Array<{ processedAt: Date | null }>>`
      SELECT processed_at AS processedAt FROM payment_notifications
      WHERE id = ${notification.id} FOR UPDATE`
    if (rows[0]?.processedAt) return null
    const result = await applyProviderPayment(tx, provider)
    await tx.paymentNotification.update({
      where: { id: notification.id },
      data: { processedAt: new Date() },
    })
    return result
  })
  return sync ? { status: "processed", sync } : { status: "duplicate" }
}

/**
 * Reads one pending payment from Mercado Pago and applies it (#57):
 * by the payment_id when known, otherwise by the external reference
 * (creation call without answer). An attempt Mercado Pago never
 * registered is canceled after a while, so the customer may pay again.
 *
 * @param payment - Pending payment row.
 * @param now - Reference time.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The sync result, or null when nothing was found.
 */
async function reconcilePayment(
  payment: { id: string; paymentId: string | null; createdAt: Date },
  now: Date,
  fetcher: typeof fetch
): Promise<PaymentSyncResult | null> {
  let provider: ProviderPayment | null = null
  try {
    provider = payment.paymentId
      ? await getMercadoPagoPayment(payment.paymentId, fetcher)
      : await findMercadoPagoPaymentByReference(payment.id, fetcher)
  } catch (error) {
    if (!(error instanceof MercadoPagoError) || error.kind !== "not_found") {
      throw error
    }
  }
  // Marks the row as checked, so the next round reads the others first
  const touch = () =>
    prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: { updatedAt: now },
    })
  if (provider) {
    const found = provider
    const result = await prisma.$transaction((tx) =>
      applyProviderPayment(tx, found, { now })
    )
    if (!result.changed) await touch()
    return result
  }
  if (
    !payment.paymentId &&
    now.getTime() - payment.createdAt.getTime() > UNREGISTERED_GIVE_UP_MS
  ) {
    await prisma.payment.updateMany({
      where: { id: payment.id, status: "PENDING", paymentId: null },
      data: { status: "CANCELED", statusDetail: "provider_not_found" },
    })
  } else {
    await touch()
  }
  return null
}

/**
 * Reads one pending payment from Mercado Pago right away (#58), for the
 * customer watching the payment page: the status changes there even
 * when the webhook is late.
 *
 * @param paymentRowId - Our payment row id.
 * @param options - Reference time and fetch implementation (tests).
 * @returns The sync result, or null when nothing changed or the payment
 * is no longer pending.
 */
export async function refreshPendingPayment(
  paymentRowId: string,
  options: { now?: Date; fetcher?: typeof fetch } = {}
): Promise<PaymentSyncResult | null> {
  if (!mercadoPagoConfig()) return null
  const payment = await prisma.payment.findFirst({
    where: { id: paymentRowId, status: "PENDING" },
    select: { id: true, paymentId: true, createdAt: true },
  })
  if (!payment) return null
  return reconcilePayment(
    payment,
    options.now ?? new Date(),
    options.fetcher ?? fetch
  )
}

/**
 * Reconciliation of the payments whose webhook did not arrive (#57):
 * reads the pending payments with `GET /v1/payments/{id}` (or by the
 * external reference) and applies them, least recently checked first.
 * Runs as a background job and right before the Pix/boleto expiration,
 * so a payment made at the last minute is not canceled. Never throws:
 * a failure of one payment is logged and the round goes on.
 *
 * @param options - Reference time, only payments already expired, and
 * the fetch implementation (tests).
 * @returns How many payments changed.
 */
export async function reconcilePendingPayments(
  options: { now?: Date; expiredOnly?: boolean; fetcher?: typeof fetch } = {}
): Promise<number> {
  if (!mercadoPagoConfig()) return 0
  const now = options.now ?? new Date()
  const pending = await prisma.payment.findMany({
    where: {
      status: "PENDING",
      method: { in: ["CARD", "PIX", "BOLETO"] },
      createdAt: { lt: new Date(now.getTime() - RECONCILE_MIN_AGE_MS) },
      ...(options.expiredOnly ? { expiresAt: { lt: now } } : {}),
    },
    select: { id: true, paymentId: true, createdAt: true },
    orderBy: { updatedAt: "asc" },
    take: RECONCILE_BATCH,
  })

  let changed = 0
  for (const payment of pending) {
    try {
      const result = await reconcilePayment(
        payment,
        now,
        options.fetcher ?? fetch
      )
      if (result?.changed) changed += 1
    } catch (error) {
      logger.warn("payment reconciliation failed", {
        paymentRowId: payment.id,
        error: error instanceof Error ? error.name : "unknown",
      })
    }
  }
  if (changed > 0) logger.info("payments reconciled", { count: changed })
  return changed
}
