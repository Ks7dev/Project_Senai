import {
  centsToMoney,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"

/** A quote line with its unit price. */
export type PricedQuoteLine = {
  /** Units. */
  quantity: number
  /** Unit price as a decimal string. */
  unitPrice: string
}

/** Totals of a quote, as decimal strings. */
export type QuoteTotals = {
  /** Sum of the lines. */
  subtotal: string
  /** Discount granted. */
  discount: string
  /** Shipping. */
  shippingTotal: string
  /** Subtotal minus discount plus shipping. */
  total: string
}

/**
 * Sums the lines of a quote in integer cents, so money is never summed
 * as floating point.
 *
 * @param lines - Lines with quantity and unit price.
 * @param extras - Discount and shipping, as decimal strings.
 * @returns The totals.
 * @throws Error when the discount is larger than the subtotal.
 */
export function quoteTotals(
  lines: readonly PricedQuoteLine[],
  extras: { discount?: string; shippingTotal?: string } = {}
): QuoteTotals {
  const subtotal = lines.reduce(
    (sum, line) => sum + moneyToCents(line.unitPrice) * line.quantity,
    0
  )
  const discount = moneyToCents(extras.discount ?? "0")
  const shipping = moneyToCents(extras.shippingTotal ?? "0")
  if (discount > subtotal) throw new Error("Discount above subtotal")
  return {
    subtotal: centsToMoney(subtotal),
    discount: centsToMoney(discount),
    shippingTotal: centsToMoney(shipping),
    total: centsToMoney(subtotal - discount + shipping),
  }
}

/**
 * Current catalog price of a variation: its own price, or the product
 * base price.
 *
 * @param sku - Variation price and product base price (Decimal-like).
 * @returns The unit price as a decimal string.
 */
export function catalogUnitPrice(sku: {
  price: { toFixed: (digits: number) => string } | null
  product: { basePrice: { toFixed: (digits: number) => string } }
}): string {
  return (sku.price ?? sku.product.basePrice).toFixed(2)
}
