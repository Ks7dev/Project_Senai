/** Stock counters of a SKU (RF43): physical units and reserved units. */
export type StockCounters = {
  /** Units physically in stock. */
  onHand: number
  /** Units held by orders that are not confirmed yet. */
  reserved: number
}

/** Kind of stock movement recorded in `stock_movements`. */
export type StockMovementKind =
  "RESERVE" | "RELEASE" | "WRITE_OFF" | "RESTOCK" | "ADJUSTMENT"

/**
 * Units that can still be sold (RF44): on hand minus the reservations
 * of open orders, never below zero. A SKU without a stock row has none.
 *
 * @param stock - Counters of the SKU, or null when there is no row.
 * @returns Available units.
 */
export function availableQuantity(
  stock: StockCounters | null | undefined
): number {
  if (!stock) return 0
  return Math.max(0, stock.onHand - stock.reserved)
}

/**
 * Units of each SKU still reserved by one order: what was reserved
 * minus what was already released or written off. Used to release or
 * write off exactly what the order holds, so repeating the operation
 * changes nothing (idempotent).
 *
 * @param movements - Stock movements of the order.
 * @returns Outstanding reserved units by SKU id (only positive values).
 */
export function outstandingReservations(
  movements: ReadonlyArray<{
    skuId: string
    type: StockMovementKind
    quantity: number
  }>
): Map<string, number> {
  const totals = new Map<string, number>()
  for (const movement of movements) {
    const sign =
      movement.type === "RESERVE"
        ? 1
        : movement.type === "RELEASE" || movement.type === "WRITE_OFF"
          ? -1
          : 0
    if (sign === 0) continue
    totals.set(
      movement.skuId,
      (totals.get(movement.skuId) ?? 0) + sign * movement.quantity
    )
  }
  for (const [skuId, quantity] of totals) {
    if (quantity <= 0) totals.delete(skuId)
  }
  return totals
}

/**
 * Adds up the quantities of order lines that share a SKU, so each SKU
 * is locked and reserved once.
 *
 * @param items - Order lines.
 * @returns Quantity by SKU id, sorted by SKU id (lock order).
 */
export function groupBySku(
  items: ReadonlyArray<{ skuId: string; quantity: number }>
): Array<{ skuId: string; quantity: number }> {
  const totals = new Map<string, number>()
  for (const item of items) {
    totals.set(item.skuId, (totals.get(item.skuId) ?? 0) + item.quantity)
  }
  return [...totals]
    .map(([skuId, quantity]) => ({ skuId, quantity }))
    .sort((a, b) => (a.skuId < b.skuId ? -1 : a.skuId > b.skuId ? 1 : 0))
}
