/**
 * Pure pricing rules of the customer price tables (RF21) and of the
 * automatic volume discounts (RN04). Money is handled as integer cents
 * and percentages as basis points (1% = 100), so nothing is summed as
 * floating point.
 */

/** Price table that applies to a customer (RF21). */
export type CustomerPricing = {
  /** Price table id, or null for the catalog price. */
  tableId: string | null
  /** Price table name, shown to the customer, or null. */
  tableName: string | null
  /** Default discount of the table, in basis points. */
  defaultBasisPoints: number
  /** Discount per product id, in basis points, replacing the default. */
  productBasisPoints: ReadonlyMap<string, number>
}

/** Catalog price for everyone: visitors and customers without a table. */
export const LIST_PRICING: CustomerPricing = {
  tableId: null,
  tableName: null,
  defaultBasisPoints: 0,
  productBasisPoints: new Map(),
}

/** A volume discount rule of a category (RN04). */
export type VolumeRule = {
  /** Rule id. */
  id: string
  /** Category the rule applies to. */
  categoryId: string
  /** Category name, shown to the customer. */
  categoryName: string
  /** Minimum units of the category, or null. */
  minQuantity: number | null
  /** Minimum amount of the category in cents, or null. */
  minAmountCents: number | null
  /** Discount in basis points. */
  basisPoints: number
}

/** A cart line as the volume discount sees it. */
export type VolumeLine = {
  /** Category of the product. */
  categoryId: string
  /** Units. */
  quantity: number
  /** Line amount in cents (customer price × quantity). */
  totalCents: number
}

/** A volume discount applied to the cart. */
export type AppliedVolumeDiscount = {
  /** Rule id. */
  ruleId: string
  /** Category id. */
  categoryId: string
  /** Category name. */
  categoryName: string
  /** Discount in basis points. */
  basisPoints: number
  /** Units of the category in the cart. */
  quantity: number
  /** Amount of the category the discount applies to, in cents. */
  baseCents: number
  /** Discount in cents. */
  discountCents: number
}

/**
 * Converts a percentage (decimal string or number) into basis points.
 *
 * @param percent - Percentage, e.g. "8.50".
 * @returns Basis points, e.g. 850.
 */
export function percentToBasisPoints(percent: string | number): number {
  return Math.round(Number(percent) * 100)
}

/**
 * Converts basis points into a decimal string with two places.
 *
 * @param basisPoints - Basis points, e.g. 850.
 * @returns The percentage, e.g. "8.50".
 */
export function basisPointsToPercent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2)
}

/**
 * Formats basis points as a Brazilian percentage, without needless
 * decimals.
 *
 * @param basisPoints - Basis points, e.g. 850.
 * @returns The label, e.g. "8,5%".
 */
export function formatPercent(basisPoints: number): string {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(basisPoints / 100)}%`
}

/**
 * Discount in cents of an amount, rounded to the nearest cent.
 *
 * @param cents - Amount in cents.
 * @param basisPoints - Discount in basis points.
 * @returns The discount in cents.
 */
export function discountCents(cents: number, basisPoints: number): number {
  if (basisPoints <= 0 || cents <= 0) return 0
  return Math.min(cents, Math.round((cents * basisPoints) / 10_000))
}

/**
 * Discount of the customer table for a product: the product override
 * when there is one, the table default otherwise.
 *
 * @param pricing - Customer pricing.
 * @param productId - Product id.
 * @returns The discount in basis points.
 */
export function productDiscountBasisPoints(
  pricing: CustomerPricing,
  productId: string
): number {
  return pricing.productBasisPoints.get(productId) ?? pricing.defaultBasisPoints
}

/**
 * Unit price of a product for the customer (RF21): the catalog price
 * minus the discount of the customer table.
 *
 * @param listCents - Catalog unit price in cents.
 * @param pricing - Customer pricing.
 * @param productId - Product id.
 * @returns The customer unit price in cents.
 */
export function customerUnitCents(
  listCents: number,
  pricing: CustomerPricing,
  productId: string
): number {
  return (
    listCents -
    discountCents(listCents, productDiscountBasisPoints(pricing, productId))
  )
}

/**
 * Whether a rule has reached its minimum quantity and/or amount. A rule
 * without any minimum never applies.
 *
 * @param rule - Volume rule.
 * @param quantity - Units of the category.
 * @param amountCents - Amount of the category in cents.
 * @returns True when the rule applies.
 */
export function ruleReached(
  rule: Pick<VolumeRule, "minQuantity" | "minAmountCents">,
  quantity: number,
  amountCents: number
): boolean {
  if (rule.minQuantity === null && rule.minAmountCents === null) return false
  return (
    (rule.minQuantity === null || quantity >= rule.minQuantity) &&
    (rule.minAmountCents === null || amountCents >= rule.minAmountCents)
  )
}

/**
 * Automatic volume discounts of a cart (RN04). Lines are grouped by the
 * category of the product; in each category the largest discount whose
 * minimum quantity and/or amount was reached applies to the amount of
 * the category. Discounts never add up inside a category.
 *
 * @param lines - Purchasable lines with their customer prices.
 * @param rules - Active volume rules.
 * @returns The discounts applied, one per category at most.
 */
export function computeVolumeDiscounts(
  lines: VolumeLine[],
  rules: VolumeRule[]
): AppliedVolumeDiscount[] {
  const groups = new Map<string, { quantity: number; totalCents: number }>()
  for (const line of lines) {
    const group = groups.get(line.categoryId) ?? { quantity: 0, totalCents: 0 }
    group.quantity += line.quantity
    group.totalCents += line.totalCents
    groups.set(line.categoryId, group)
  }
  const applied: AppliedVolumeDiscount[] = []
  for (const [categoryId, group] of groups) {
    const best = rules
      .filter(
        (rule) =>
          rule.categoryId === categoryId &&
          rule.basisPoints > 0 &&
          ruleReached(rule, group.quantity, group.totalCents)
      )
      .sort((a, b) => b.basisPoints - a.basisPoints)[0]
    if (!best) continue
    applied.push({
      ruleId: best.id,
      categoryId,
      categoryName: best.categoryName,
      basisPoints: best.basisPoints,
      quantity: group.quantity,
      baseCents: group.totalCents,
      discountCents: discountCents(group.totalCents, best.basisPoints),
    })
  }
  return applied
}

/**
 * Describes the minimum of a volume rule for the customer.
 *
 * @param rule - Minimum quantity and amount (amount as a decimal string).
 * @returns The text, e.g. "a partir de 10 unidades e R$ 2.000,00".
 */
export function describeVolumeMinimum(rule: {
  minQuantity: number | null
  minAmount: string | null
}): string {
  const parts: string[] = []
  if (rule.minQuantity !== null) {
    parts.push(
      `${rule.minQuantity} ${rule.minQuantity === 1 ? "unidade" : "unidades"}`
    )
  }
  if (rule.minAmount !== null) {
    parts.push(
      new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(rule.minAmount))
    )
  }
  return parts.length > 0 ? `a partir de ${parts.join(" e ")}` : ""
}
