import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { enqueueOrderStatusEmails } from "@/features/shared/lib/orders/order-notifications"
import {
  canTransition,
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import {
  releaseOrderStock,
  writeOffOrderStock,
} from "@/features/shared/lib/stock/stock-service"

/** A status change of an order. */
export type OrderTransition = {
  /** Order id. */
  orderId: string
  /** Order number. */
  number: string
  /** Status before. */
  from: OrderStatusKey
  /** Status after. */
  to: OrderStatusKey
}

/**
 * Locks the order row with `SELECT ... FOR UPDATE` (justified raw
 * query: Prisma has no row lock), so two status changes of the same
 * order run one after the other and the second sees the first.
 *
 * @param tx - Prisma transaction.
 * @param orderId - Order id.
 * @returns The order number and current status, or null.
 */
async function lockOrder(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<{ number: string; status: OrderStatusKey } | null> {
  const rows = await tx.$queryRaw<
    Array<{ number: string; status: OrderStatusKey }>
  >`SELECT number, status FROM orders WHERE id = ${orderId} FOR UPDATE`
  return rows[0] ?? null
}

/**
 * Message shown when a transition is not allowed.
 *
 * @param from - Current status.
 * @param to - Wanted status.
 * @returns The message, in Portuguese.
 */
export function invalidTransitionMessage(
  from: OrderStatusKey,
  to: OrderStatusKey
): string {
  return `O pedido está em "${ORDER_STATUS[from].label}" e não pode passar para "${ORDER_STATUS[to].label}".`
}

/**
 * The single way to change the status of an order (RF54). Runs inside
 * the caller's transaction:
 * 1. locks the order row;
 * 2. refuses transitions the life cycle does not allow (and, with
 *    `expectedFrom`, orders that already left the expected statuses);
 * 3. applies the stock effect: write-off when the order is paid or
 *    approved, release when it is canceled (RF43, RN14);
 * 4. stamps the shipment dates when it ships or is delivered;
 * 5. writes the status history with the date and who did it (null for
 *    the system: payment webhook, expiration job);
 * 6. queues the customer or approver e-mail of the new status (RF53),
 *    so it is sent only if the change is saved.
 *
 * @param tx - Prisma transaction.
 * @param input - Order, new status, responsible user, note and the
 * optional expected current statuses with their error message.
 * @returns The transition done.
 * @throws AppError("not_found") or AppError("invalid_transition").
 */
export async function transitionOrder(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string
    to: OrderStatusKey
    changedById: string | null
    note?: string | null
    expectedFrom?: readonly OrderStatusKey[]
    unexpectedMessage?: string
    now?: Date
  }
): Promise<OrderTransition> {
  const order = await lockOrder(tx, input.orderId)
  if (!order) throw new AppError("Pedido não encontrado.", "not_found")
  const from = order.status

  if (input.expectedFrom && !input.expectedFrom.includes(from)) {
    throw new AppError(
      input.unexpectedMessage ?? invalidTransitionMessage(from, input.to),
      "invalid_transition"
    )
  }
  if (!canTransition(from, input.to)) {
    throw new AppError(
      invalidTransitionMessage(from, input.to),
      "invalid_transition"
    )
  }

  const now = input.now ?? new Date()
  await tx.order.update({
    where: { id: input.orderId },
    data: { status: input.to },
  })

  if (input.to === "PAID") {
    await writeOffOrderStock(tx, {
      orderId: input.orderId,
      userId: input.changedById,
    })
  }
  if (input.to === "CANCELED") {
    await releaseOrderStock(tx, {
      orderId: input.orderId,
      userId: input.changedById,
      note: "Liberação por cancelamento do pedido",
    })
  }
  if (input.to === "SHIPPED" || input.to === "DELIVERED") {
    await tx.shipment.updateMany({
      where: { orderId: input.orderId },
      data: input.to === "SHIPPED" ? { shippedAt: now } : { deliveredAt: now },
    })
  }

  await tx.orderStatusHistory.create({
    data: {
      orderId: input.orderId,
      fromStatus: from,
      toStatus: input.to,
      changedById: input.changedById,
      note: input.note ? input.note.slice(0, 255) : null,
      createdAt: now,
    },
  })
  await enqueueOrderStatusEmails(tx, { orderId: input.orderId, to: input.to })
  return { orderId: input.orderId, number: order.number, from, to: input.to }
}
