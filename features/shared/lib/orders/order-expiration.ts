import "server-only"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"

/** How many expired orders one sweep handles at most. */
const SWEEP_BATCH = 100

/** Note recorded on the order history when Pix or boleto expires. */
export const EXPIRED_PAYMENT_NOTE =
  "Pagamento não confirmado no prazo: pedido cancelado e reserva liberada."

/**
 * Cancels the orders whose Pix or boleto expired without payment and
 * releases their stock reservation (RN14). The deadline is the
 * `expires_at` of the payment, set at checkout from the configurable
 * settings (`payment.pix_expiration_minutes` and
 * `payment.boleto_expiration_business_days`). Each order runs in its
 * own transaction through the order life cycle (#65), which locks the
 * order, releases the reservation and records the history, so a
 * payment confirmed at the same moment is never canceled.
 *
 * @param now - Reference time (tests pass a fixed one).
 * @returns Ids of the canceled orders.
 */
export async function expireUnpaidOrders(
  now: Date = new Date()
): Promise<string[]> {
  const candidates = await prisma.order.findMany({
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

  const canceled: string[] = []
  for (const { id } of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
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
      })
      canceled.push(id)
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
