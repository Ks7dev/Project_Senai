import "server-only"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import {
  loadPaymentDeadlines,
  paymentExpiresAt,
} from "@/features/shared/lib/payments/payment-deadlines"

/** How many expired orders one sweep handles at most. */
const SWEEP_BATCH = 100

/** Note recorded on the order history when Pix or boleto expires. */
export const EXPIRED_PAYMENT_NOTE =
  "Pagamento não confirmado no prazo: pedido cancelado e reserva liberada."

/**
 * Orders paid by Pix or boleto whose customer never issued the payment
 * in time: no open payment and the deadline, counted from when the
 * order started waiting for the payment (after the approval or the
 * shipping quote, if any), has passed (RN14).
 *
 * @param now - Reference time.
 * @returns Ids of the orders to cancel.
 */
async function findUnissuedExpired(now: Date): Promise<string[]> {
  const deadlines = await loadPaymentDeadlines()
  const orders = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      paymentMethod: { in: ["PIX", "BOLETO"] },
      payments: { none: { status: { in: ["PENDING", "APPROVED"] } } },
    },
    select: {
      id: true,
      paymentMethod: true,
      createdAt: true,
      statusHistory: {
        where: { toStatus: "AWAITING_PAYMENT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH,
  })
  return orders
    .filter((order) => {
      const start = order.statusHistory[0]?.createdAt ?? order.createdAt
      const method = order.paymentMethod === "PIX" ? "PIX" : "BOLETO"
      return paymentExpiresAt(method, start, deadlines) < now
    })
    .map((order) => order.id)
}

/**
 * Cancels the orders whose Pix or boleto expired without payment and
 * releases their stock reservation (RN14). The deadline is the
 * `expires_at` of the payment, set when the Pix or boleto is issued
 * from the configurable settings (`payment.pix_expiration_minutes` and
 * `payment.boleto_expiration_business_days`); an order whose payment
 * was never issued expires by the same deadlines, counted from when it
 * started waiting for the payment. Each order runs in its own
 * transaction: the order row is locked and the open payments are read
 * again, so a payment issued or confirmed at the same moment is never
 * canceled; the order life cycle (#65) releases the reservation and
 * records the history.
 *
 * @param now - Reference time (tests pass a fixed one).
 * @returns Ids of the canceled orders.
 */
export async function expireUnpaidOrders(
  now: Date = new Date()
): Promise<string[]> {
  const withExpiredPayment = await prisma.order.findMany({
    where: {
      status: "AWAITING_PAYMENT",
      payments: {
        some: {
          method: { in: ["PIX", "BOLETO"] },
          status: "PENDING",
          expiresAt: { lt: now },
        },
        none: { status: "APPROVED" },
      },
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: SWEEP_BATCH,
  })
  const candidates = [
    ...new Set([
      ...withExpiredPayment.map((order) => order.id),
      ...(await findUnissuedExpired(now)),
    ]),
  ]

  const canceled: string[] = []
  for (const id of candidates) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        // Lock the order (justified raw query: Prisma has no row lock)
        // and read its payments again under the lock
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`
        const open = await tx.payment.count({
          where: {
            orderId: id,
            OR: [
              { status: "APPROVED" },
              {
                status: "PENDING",
                OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
              },
            ],
          },
        })
        if (open > 0) return false
        await transitionOrder(tx, {
          orderId: id,
          to: "CANCELED",
          changedById: null,
          note: EXPIRED_PAYMENT_NOTE,
          expectedFrom: ["AWAITING_PAYMENT"],
          now,
        })
        await tx.payment.updateMany({
          where: {
            orderId: id,
            status: "PENDING",
            method: { in: ["PIX", "BOLETO"] },
            expiresAt: { lt: now },
          },
          data: { status: "EXPIRED" },
        })
        return true
      })
      if (done) canceled.push(id)
    } catch (error) {
      // Paid or canceled meanwhile: nothing to expire
      if (error instanceof AppError && error.code === "invalid_transition") {
        continue
      }
      throw error
    }
  }
  if (canceled.length > 0) {
    logger.info("expired orders canceled", { count: canceled.length })
  }
  return canceled
}
