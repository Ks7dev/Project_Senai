import {
  centsToMoney,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"

/** Where a promotion applies (RF46). */
export type PromotionScopeKey = "PRODUCT" | "CATEGORY" | "COUPON"

/** How the discount is calculated (RF46). */
export type DiscountTypeKey = "PERCENT" | "FIXED"

/** A promotion rule as the pricing reads it. */
export type PromotionRule = {
  /** Promotion id. */
  id: string
  /** Name shown to the customer, in Portuguese. */
  name: string
  /** Product, category or coupon. */
  scope: PromotionScopeKey
  /** Product of a PRODUCT promotion. */
  productId: string | null
  /** Category of a CATEGORY promotion (subcategories included). */
  categoryId: string | null
  /** Code of a COUPON promotion, upper case. */
  couponCode: string | null
  /** Percent or fixed amount. */
  discountType: DiscountTypeKey
  /**
   * Percent (0 to 100) or fixed amount as a decimal string: per unit for
   * product and category promotions, per order for coupons.
   */
  discountValue: string
  /** Courtesy shipping granted by the rule (RN23). */
  freeShipping: boolean
  /** Order total (items and services) required, or null. */
  minOrderTotal: string | null
  /** Start of the validity. */
  startsAt: Date
  /** End of the validity. */
  endsAt: Date
  /** Turned on in the back office. */
  active: boolean
}

/** A cart line as the promotion pricing needs it. */
export type PromotionLine = {
  /** Cart item id. */
  id: string
  /** Product id. */
  productId: string
  /**
   * Category of the product and its ancestors, so a promotion on a
   * parent category reaches the subcategories.
   */
  categoryIds: string[]
  /** Quantity. */
  quantity: number
  /** Unit price, decimal string. */
  unitPrice: string
  /** Quantity × unit price, decimal string. */
  total: string
  /** Lines that left the catalog do not count. */
  purchasable: boolean
}

/** A promotion that reduced the order. */
export type AppliedPromotion = {
  /** Promotion id. */
  id: string
  /** Name shown to the customer. */
  name: string
  /** Discount it gave, decimal string ("0.00" for courtesy shipping only). */
  amount: string
  /** Whether it grants courtesy shipping. */
  freeShipping: boolean
}

/** What happened to the coupon typed by the customer. */
export type CouponStatus =
  "applied" | "not_found" | "expired" | "min_not_reached" | "no_discount"

/** Result of the promotion pricing of a cart. */
export type PromotionPricing = {
  /** Total discount, decimal string. */
  discount: string
  /** Discount per cart line id, decimal string. */
  lineDiscounts: Record<string, string>
  /** Promotions that reduced the order or grant courtesy shipping. */
  applied: AppliedPromotion[]
  /** Courtesy shipping granted by a configured rule (RN23). */
  courtesyShipping: boolean
  /** Coupon typed by the customer and its outcome, or null. */
  coupon: { code: string; status: CouponStatus } | null
}

/** Message shown for each coupon outcome. */
export const COUPON_STATUS_MESSAGE: Record<CouponStatus, string> = {
  applied: "Cupom aplicado.",
  not_found: "Cupom não encontrado.",
  expired: "Este cupom não está vigente.",
  min_not_reached: "O pedido ainda não atinge o valor mínimo deste cupom.",
  no_discount: "Este cupom não altera o valor do pedido.",
}

/**
 * Normalizes a coupon code: no spaces, upper case.
 *
 * @param code - Code typed by the customer or the admin.
 * @returns The stored form, e.g. "BEMVINDO10".
 */
export function normalizeCouponCode(code: string): string {
  return code.replace(/\s+/g, "").toUpperCase()
}

/**
 * Whether a promotion is valid at a moment: turned on and inside its
 * validity, both ends included (RF46).
 *
 * @param rule - Promotion.
 * @param now - Moment of the check.
 * @returns True when it may apply.
 */
export function isPromotionActive(
  rule: Pick<PromotionRule, "active" | "startsAt" | "endsAt">,
  now: Date
): boolean {
  return (
    rule.active &&
    rule.startsAt.getTime() <= now.getTime() &&
    now.getTime() <= rule.endsAt.getTime()
  )
}

/**
 * Category of a product and its ancestors, nearest first.
 *
 * @param parents - Parent of each category id.
 * @param categoryId - Category of the product.
 * @returns The lineage, without cycles.
 */
export function categoryLineage(
  parents: ReadonlyMap<string, string | null>,
  categoryId: string
): string[] {
  const lineage: string[] = []
  let current: string | null = categoryId
  while (current && !lineage.includes(current)) {
    lineage.push(current)
    current = parents.get(current) ?? null
  }
  return lineage
}

/**
 * Whether the order total reaches the minimum of a rule.
 *
 * @param rule - Promotion.
 * @param orderCents - Order total in cents.
 * @returns True when there is no minimum or it is reached.
 */
function reachesMinimum(
  rule: Pick<PromotionRule, "minOrderTotal">,
  orderCents: number
): boolean {
  return (
    rule.minOrderTotal === null ||
    orderCents >= moneyToCents(rule.minOrderTotal)
  )
}

/**
 * Discount of a product or category promotion on one line: a percent of
 * the line or a fixed amount per unit, never above the line total.
 *
 * @param rule - Promotion.
 * @param line - Cart line.
 * @returns The discount in cents.
 */
export function lineDiscountCents(
  rule: Pick<PromotionRule, "discountType" | "discountValue">,
  line: Pick<PromotionLine, "quantity" | "total">
): number {
  const lineCents = moneyToCents(line.total)
  const raw =
    rule.discountType === "PERCENT"
      ? Math.round((lineCents * Number(rule.discountValue)) / 100)
      : moneyToCents(rule.discountValue) * line.quantity
  return Math.max(0, Math.min(lineCents, raw))
}

/**
 * Whether a product or category promotion covers a line.
 *
 * @param rule - Promotion.
 * @param line - Cart line.
 * @returns True when the line is in the promotion.
 */
function covers(rule: PromotionRule, line: PromotionLine): boolean {
  if (rule.scope === "PRODUCT") return rule.productId === line.productId
  if (rule.scope === "CATEGORY") {
    return (
      rule.categoryId !== null && line.categoryIds.includes(rule.categoryId)
    )
  }
  return false
}

/**
 * Applies the promotions of the cart (RF46, RN23):
 * - each line takes the single best product or category promotion in
 *   force (promotions on the same line never add up);
 * - the coupon, when valid, applies on the items left after the line
 *   discounts (a percent of them, or a fixed amount per order);
 * - courtesy shipping only comes from a rule that applied (RN23).
 * Promotions only apply inside their validity and above their minimum,
 * which is compared with the cart total (items and services) before any
 * discount. Services (engraving, packaging) are never discounted.
 *
 * @param input - Lines, cart total, automatic rules, coupon and moment.
 * @returns The discount, the applied promotions and courtesy shipping.
 */
export function pricePromotions(input: {
  lines: PromotionLine[]
  /** Items plus services before discounts, decimal string. */
  cartTotal: string
  /** Product and category promotions. */
  rules: PromotionRule[]
  /** Code typed by the customer, or null. */
  couponCode: string | null
  /** Coupon promotion found for the code, or null. */
  coupon: PromotionRule | null
  now: Date
}): PromotionPricing {
  const orderCents = moneyToCents(input.cartTotal)
  const automatic = input.rules.filter(
    (rule) =>
      rule.scope !== "COUPON" &&
      isPromotionActive(rule, input.now) &&
      reachesMinimum(rule, orderCents)
  )
  const lineDiscounts: Record<string, string> = {}
  const appliedCents = new Map<string, number>()
  const appliedRules = new Map<string, PromotionRule>()
  let itemsAfterDiscount = 0
  let discountCents = 0

  for (const line of input.lines) {
    if (!line.purchasable) continue
    let best: { rule: PromotionRule; cents: number } | null = null
    for (const rule of automatic) {
      if (!covers(rule, line)) continue
      const cents = lineDiscountCents(rule, line)
      if (
        !best ||
        cents > best.cents ||
        (cents === best.cents && rule.freeShipping && !best.rule.freeShipping)
      ) {
        best = { rule, cents }
      }
    }
    const cents = best?.cents ?? 0
    itemsAfterDiscount += moneyToCents(line.total) - cents
    if (!best) continue
    discountCents += cents
    if (cents > 0) lineDiscounts[line.id] = centsToMoney(cents)
    appliedRules.set(best.rule.id, best.rule)
    appliedCents.set(
      best.rule.id,
      (appliedCents.get(best.rule.id) ?? 0) + cents
    )
  }

  let coupon: PromotionPricing["coupon"] = null
  if (input.couponCode) {
    const code = normalizeCouponCode(input.couponCode)
    const rule = input.coupon
    let status: CouponStatus
    if (!rule || rule.scope !== "COUPON" || rule.couponCode !== code) {
      status = "not_found"
    } else if (!isPromotionActive(rule, input.now)) {
      status = "expired"
    } else if (!reachesMinimum(rule, orderCents)) {
      status = "min_not_reached"
    } else {
      const raw =
        rule.discountType === "PERCENT"
          ? Math.round((itemsAfterDiscount * Number(rule.discountValue)) / 100)
          : moneyToCents(rule.discountValue)
      const cents = Math.max(0, Math.min(itemsAfterDiscount, raw))
      if (cents === 0 && !rule.freeShipping) {
        status = "no_discount"
      } else {
        status = "applied"
        discountCents += cents
        appliedRules.set(rule.id, rule)
        appliedCents.set(rule.id, cents)
      }
    }
    coupon = { code, status }
  }

  const applied = [...appliedRules.values()].map((rule) => ({
    id: rule.id,
    name: rule.name,
    amount: centsToMoney(appliedCents.get(rule.id) ?? 0),
    freeShipping: rule.freeShipping,
  }))
  return {
    discount: centsToMoney(discountCents),
    lineDiscounts,
    applied,
    courtesyShipping: applied.some((item) => item.freeShipping),
    coupon,
  }
}

/** Why the shipping became free. */
export type FreeShippingReason = "promotion" | "regional_minimum"

/** A shipping option that may have become free. */
export type DiscountableShippingOption = {
  /** Price as a decimal string. */
  price: string
  /** Price before the free shipping, when it became free. */
  originalPrice?: string
  /** Why it became free. */
  freeShippingReason?: FreeShippingReason
}

/**
 * Why the order ships for free, if it does (RN23): a promotion with
 * courtesy shipping, or the order total (after discounts, before
 * shipping) reaching the free shipping minimum of the delivery region.
 * Free shipping is never a fixed condition of the store.
 *
 * @param input - Courtesy flag, region minimum and order total.
 * @returns The reason, or null when the shipping is charged.
 */
export function freeShippingReason(input: {
  courtesyShipping: boolean
  /** Minimum of the region of the CEP, or null when not configured. */
  regionMinimum: string | null
  /** Order total after discounts, before shipping, decimal string. */
  orderTotal: string
}): FreeShippingReason | null {
  if (input.courtesyShipping) return "promotion"
  if (
    input.regionMinimum !== null &&
    moneyToCents(input.orderTotal) >= moneyToCents(input.regionMinimum)
  ) {
    return "regional_minimum"
  }
  return null
}

/**
 * Makes every shipping option free, keeping the original price so the
 * customer sees what was saved.
 *
 * @param options - Quoted options.
 * @param reason - Why the shipping is free, or null to keep the prices.
 * @returns The options.
 */
export function applyFreeShipping<T extends DiscountableShippingOption>(
  options: T[],
  reason: FreeShippingReason | null
): T[] {
  if (!reason) return options
  return options.map((option) =>
    moneyToCents(option.price) === 0
      ? option
      : {
          ...option,
          price: "0.00",
          originalPrice: option.price,
          freeShippingReason: reason,
        }
  )
}

/** Message of the free shipping, in Portuguese. */
export const FREE_SHIPPING_MESSAGE: Record<FreeShippingReason, string> = {
  promotion: "Frete cortesia da promoção aplicada.",
  regional_minimum: "Frete grátis: o pedido atingiu o mínimo da sua região.",
}
