import "server-only"
import { Prisma } from "@/generated/prisma/client"
import { AppError } from "@/features/shared/lib/errors/action-result"
import {
  availableQuantity,
  groupBySku,
  outstandingReservations,
  type StockCounters,
} from "@/features/shared/lib/stock/stock-math"

/** Message shown when there are not enough units for the order. */
export const OUT_OF_STOCK_MESSAGE =
  "Estoque insuficiente para concluir o pedido. Revise as quantidades do carrinho."

/** A locked stock row. */
type LockedStock = StockCounters & { skuId: string }

/**
 * Locks the stock rows of the given SKUs with `SELECT ... FOR UPDATE`
 * (justified raw query: Prisma has no row lock), always in SKU id
 * order so two transactions never deadlock. Until the transaction
 * ends, any other reservation of the same SKU waits, which is what
 * keeps two orders from taking the same unit (RF43).
 *
 * @param tx - Prisma transaction.
 * @param skuIds - SKUs to lock.
 * @returns The locked counters by SKU id.
 */
export async function lockStockRows(
  tx: Prisma.TransactionClient,
  skuIds: readonly string[]
): Promise<Map<string, LockedStock>> {
  const ids = [...new Set(skuIds)].sort()
  if (ids.length === 0) return new Map()
  const rows = await tx.$queryRaw<
    Array<{ skuId: string; onHand: number; reserved: number }>
  >`
    SELECT sku_id AS skuId, on_hand AS onHand, reserved
    FROM stock
    WHERE sku_id IN (${Prisma.join(ids)})
    ORDER BY sku_id
    FOR UPDATE`
  return new Map(
    rows.map((row) => [
      row.skuId,
      {
        skuId: row.skuId,
        onHand: Number(row.onHand),
        reserved: Number(row.reserved),
      },
    ])
  )
}

/** Result of a reservation, per SKU. */
export type ReservationLine = {
  /** SKU id. */
  skuId: string
  /** Units asked by the order. */
  requested: number
  /** Units reserved from the stock. */
  reserved: number
  /** Units without stock, made to order ("sob encomenda", RF44). */
  backordered: number
}

/**
 * Reserves the units of a new order (RF43, RN14). Runs inside the
 * checkout transaction: the stock rows are locked with
 * `SELECT ... FOR UPDATE`, the available quantity (on hand minus open
 * reservations) is checked and the reservation is recorded as a
 * `RESERVE` movement of the order.
 *
 * Without `allowBackorder`, a missing unit refuses the whole order. With
 * it, only what is available is reserved and the rest is reported as
 * made to order, so the buyer sees "sob encomenda" (RF44).
 *
 * @param tx - Prisma transaction.
 * @param input - Order, lines, who placed it and the backorder option.
 * @returns What was reserved for each SKU.
 * @throws AppError("out_of_stock") when a unit is missing and backorder
 * is not allowed.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  input: {
    orderId: string
    items: ReadonlyArray<{ skuId: string; quantity: number }>
    userId: string | null
    allowBackorder?: boolean
  }
): Promise<ReservationLine[]> {
  const lines = groupBySku(input.items)
  if (
    lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 1)
  ) {
    throw new AppError("Quantidade inválida.", "invalid_quantity")
  }
  const locked = await lockStockRows(
    tx,
    lines.map((line) => line.skuId)
  )

  const plan = lines.map((line): ReservationLine => {
    const available = availableQuantity(locked.get(line.skuId))
    const reserved = Math.min(available, line.quantity)
    return {
      skuId: line.skuId,
      requested: line.quantity,
      reserved,
      backordered: line.quantity - reserved,
    }
  })
  if (!input.allowBackorder && plan.some((line) => line.backordered > 0)) {
    throw new AppError(OUT_OF_STOCK_MESSAGE, "out_of_stock")
  }

  for (const line of plan) {
    if (line.reserved === 0) continue
    await tx.stock.update({
      where: { skuId: line.skuId },
      data: { reserved: { increment: line.reserved } },
    })
    await tx.stockMovement.create({
      data: {
        skuId: line.skuId,
        type: "RESERVE",
        quantity: line.reserved,
        orderId: input.orderId,
        userId: input.userId,
        note: "Reserva na criação do pedido",
      },
    })
  }
  return plan
}

/**
 * Units each SKU still holds for the order, read from its movements.
 *
 * @param tx - Prisma transaction.
 * @param orderId - Order id.
 * @returns Outstanding reserved units by SKU id.
 */
async function orderReservations(
  tx: Prisma.TransactionClient,
  orderId: string
): Promise<Map<string, number>> {
  const movements = await tx.stockMovement.findMany({
    where: { orderId, type: { in: ["RESERVE", "RELEASE", "WRITE_OFF"] } },
    select: { skuId: true, type: true, quantity: true },
  })
  return outstandingReservations(movements)
}

/**
 * Turns the reservation of a confirmed order into a definitive
 * write-off (RF43): payment approved (RN13) or invoiced order approved
 * by finance. Units leave both `on_hand` and `reserved`. Idempotent:
 * an order already written off changes nothing.
 *
 * @param tx - Prisma transaction.
 * @param input - Order and who confirmed it (null for the system).
 * @returns Units written off by SKU id.
 */
export async function writeOffOrderStock(
  tx: Prisma.TransactionClient,
  input: { orderId: string; userId: string | null }
): Promise<Map<string, number>> {
  const pending = await orderReservations(tx, input.orderId)
  if (pending.size === 0) return pending
  const locked = await lockStockRows(tx, [...pending.keys()])
  for (const [skuId, quantity] of pending) {
    const row = locked.get(skuId)
    if (!row) continue
    await tx.stock.update({
      where: { skuId },
      data: {
        onHand: Math.max(0, row.onHand - quantity),
        reserved: Math.max(0, row.reserved - quantity),
      },
    })
    await tx.stockMovement.create({
      data: {
        skuId,
        type: "WRITE_OFF",
        quantity,
        orderId: input.orderId,
        userId: input.userId,
        note: "Baixa na confirmação do pedido",
      },
    })
  }
  return pending
}

/**
 * Releases what an order still holds (RF43, RN14): order canceled or
 * Pix/boleto expired. Idempotent: units already released or written
 * off are not touched.
 *
 * @param tx - Prisma transaction.
 * @param input - Order, who released it (null for the system) and why.
 * @returns Units released by SKU id.
 */
export async function releaseOrderStock(
  tx: Prisma.TransactionClient,
  input: { orderId: string; userId: string | null; note: string }
): Promise<Map<string, number>> {
  const pending = await orderReservations(tx, input.orderId)
  if (pending.size === 0) return pending
  const locked = await lockStockRows(tx, [...pending.keys()])
  for (const [skuId, quantity] of pending) {
    const row = locked.get(skuId)
    if (!row) continue
    await tx.stock.update({
      where: { skuId },
      data: { reserved: Math.max(0, row.reserved - quantity) },
    })
    await tx.stockMovement.create({
      data: {
        skuId,
        type: "RELEASE",
        quantity,
        orderId: input.orderId,
        userId: input.userId,
        note: input.note,
      },
    })
  }
  return pending
}

/**
 * Manual restock by the back office (RF43): adds units on hand and
 * records a `RESTOCK` movement with who did it and why.
 *
 * @param tx - Prisma transaction.
 * @param input - SKU, units, user and note.
 * @returns Counters before and after.
 * @throws AppError("not_found") when the SKU does not exist.
 */
export async function restockSku(
  tx: Prisma.TransactionClient,
  input: { skuId: string; quantity: number; userId: string; note: string }
): Promise<{ before: StockCounters; after: StockCounters }> {
  const sku = await tx.sku.findUnique({
    where: { id: input.skuId },
    select: { id: true },
  })
  if (!sku) throw new AppError("SKU não encontrado.", "not_found")

  await tx.stock.upsert({
    where: { skuId: input.skuId },
    create: { skuId: input.skuId },
    update: {},
  })
  const locked = await lockStockRows(tx, [input.skuId])
  const before = locked.get(input.skuId) ?? { onHand: 0, reserved: 0 }
  const after = {
    onHand: before.onHand + input.quantity,
    reserved: before.reserved,
  }
  await tx.stock.update({
    where: { skuId: input.skuId },
    data: { onHand: after.onHand },
  })
  await tx.stockMovement.create({
    data: {
      skuId: input.skuId,
      type: "RESTOCK",
      quantity: input.quantity,
      userId: input.userId,
      note: input.note,
    },
  })
  return {
    before: { onHand: before.onHand, reserved: before.reserved },
    after,
  }
}
