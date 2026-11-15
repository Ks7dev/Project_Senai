/** Largest quantity of a single cart line (the same limit as shipping). */
export const MAX_LINE_QUANTITY = 999

/**
 * Adds two quantities of the same SKU, as when the visitor cart is
 * merged into the account cart at login or a project list is resumed
 * (RF07). The result never passes the line limit.
 *
 * @param current - Quantity already in the cart.
 * @param added - Quantity being added.
 * @returns The new line quantity.
 */
export function mergeQuantity(current: number, added: number): number {
  return Math.min(MAX_LINE_QUANTITY, Math.max(0, current) + Math.max(0, added))
}

/**
 * Converts a decimal string into integer cents, so money is never
 * summed as floating point.
 *
 * @param value - Decimal string, e.g. "389.00".
 * @returns Integer cents.
 */
export function moneyToCents(value: string | number): number {
  return Math.round(Number(value) * 100)
}

/**
 * Converts integer cents into a decimal string with two places.
 *
 * @param cents - Integer cents.
 * @returns Decimal string, e.g. "389.00".
 */
export function centsToMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}
