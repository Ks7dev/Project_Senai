import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  centsToMoney,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"
import type { CartView } from "@/features/shared/lib/cart/cart-types"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  applyFreeShipping,
  categoryLineage,
  freeShippingReason,
  normalizeCouponCode,
  pricePromotions,
  type PromotionPricing,
  type PromotionRule,
} from "@/features/shared/lib/promotions/promotion-math"
import type { ShippingQuote } from "@/features/shared/lib/shipping/strategies"

type Client = Prisma.TransactionClient | typeof prisma

/** Cart totals after the promotions (RF46). */
export type CartPricing = PromotionPricing & {
  /** Items plus services before the discount, decimal string. */
  cartTotal: string
  /** Order total after the discount, before shipping, decimal string. */
  total: string
}

type PromotionRow = Prisma.PromotionGetPayload<object>

/**
 * Maps a promotion row to the rule the pricing reads.
 *
 * @param row - Promotion row.
 * @returns The rule.
 */
export function toPromotionRule(row: PromotionRow): PromotionRule {
  return {
    id: row.id,
    name: row.name,
    scope: row.scope,
    productId: row.productId,
    categoryId: row.categoryId,
    couponCode: row.couponCode,
    discountType: row.discountType,
    discountValue: row.discountValue.toFixed(2),
    freeShipping: row.freeShipping,
    minOrderTotal: row.minOrderTotal?.toFixed(2) ?? null,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    active: row.active,
  }
}

/**
 * Product and category promotions in force at a moment (RF46). Only
 * active, not deleted rows whose validity contains the moment.
 *
 * @param now - Moment of the pricing.
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadAutomaticPromotions(
  now: Date,
  client: Client = prisma
): Promise<PromotionRule[]> {
  const rows = await client.promotion.findMany({
    where: {
      scope: { in: ["PRODUCT", "CATEGORY"] },
      active: true,
      deletedAt: null,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
  })
  return rows.map(toPromotionRule)
}

/**
 * Finds the coupon promotion of a code (deleted coupons do not exist for
 * the customer).
 *
 * @param code - Code typed by the customer.
 * @param client - Prisma client or transaction.
 * @returns The rule, or null.
 */
export async function findCouponPromotion(
  code: string,
  client: Client = prisma
): Promise<PromotionRule | null> {
  const row = await client.promotion.findFirst({
    where: {
      couponCode: normalizeCouponCode(code),
      scope: "COUPON",
      deletedAt: null,
    },
  })
  return row ? toPromotionRule(row) : null
}

/**
 * Applies the promotions in force to a cart (RF46, RN23). Product and
 * category ids are read from the catalog by SKU code, never from the
 * request, and the coupon is checked again at every pricing.
 *
 * @param cart - Cart view with current catalog prices.
 * @param options - Coupon code, moment and Prisma client.
 * @returns The discount, the total after it and courtesy shipping.
 */
export async function priceCart(
  cart: CartView,
  options: { couponCode: string | null; now?: Date; client?: Client }
): Promise<CartPricing> {
  const client = options.client ?? prisma
  const now = options.now ?? new Date()
  const codes = [...new Set(cart.lines.map((line) => line.skuCode))]
  const [skus, categories, rules, coupon] = await Promise.all([
    codes.length > 0
      ? client.sku.findMany({
          where: { code: { in: codes } },
          select: {
            code: true,
            product: { select: { id: true, categoryId: true } },
          },
        })
      : Promise.resolve([]),
    client.category.findMany({ select: { id: true, parentId: true } }),
    loadAutomaticPromotions(now, client),
    options.couponCode
      ? findCouponPromotion(options.couponCode, client)
      : Promise.resolve(null),
  ])
  const products = new Map(skus.map((sku) => [sku.code, sku.product]))
  const parents = new Map(categories.map((row) => [row.id, row.parentId]))
  const pricing = pricePromotions({
    lines: cart.lines.flatMap((line) => {
      const product = products.get(line.skuCode)
      if (!product) return []
      return [
        {
          id: line.id,
          productId: product.id,
          categoryIds: categoryLineage(parents, product.categoryId),
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          total: line.total,
          purchasable: line.purchasable,
        },
      ]
    }),
    cartTotal: cart.total,
    rules,
    couponCode: options.couponCode,
    coupon,
    now,
  })
  return {
    ...pricing,
    cartTotal: cart.total,
    total: centsToMoney(
      moneyToCents(cart.total) - moneyToCents(pricing.discount)
    ),
  }
}

/**
 * Free shipping minimum of the active delivery region of a CEP (RN23),
 * as configured in the back office (/admin/frete).
 *
 * @param cep - Destination CEP, 8 digits.
 * @param client - Prisma client or transaction.
 * @returns The minimum as a decimal string, or null when not set.
 */
export async function loadRegionFreeShippingMinimum(
  cep: string,
  client: Client = prisma
): Promise<string | null> {
  const region = await client.shippingRegion.findFirst({
    where: { active: true, cepStart: { lte: cep }, cepEnd: { gte: cep } },
    orderBy: { cepStart: "desc" },
    select: { freeShippingMinimum: true },
  })
  return region?.freeShippingMinimum?.toFixed(2) ?? null
}

/**
 * Applies courtesy shipping (promotion) or the regional free shipping
 * minimum to a quote (RN23). The manual quote is left as it is: the
 * sales team quotes it with the same rules.
 *
 * @param quote - Shipping quote.
 * @param input - Pricing of the cart and destination CEP.
 * @param client - Prisma client or transaction.
 * @returns The quote with free options when a rule applies.
 */
export async function applyShippingBenefits(
  quote: ShippingQuote,
  input: {
    pricing: Pick<CartPricing, "courtesyShipping" | "total">
    cep: string
  },
  client: Client = prisma
): Promise<ShippingQuote> {
  if (quote.status !== "quoted") return quote
  const reason = freeShippingReason({
    courtesyShipping: input.pricing.courtesyShipping,
    regionMinimum: input.pricing.courtesyShipping
      ? null
      : await loadRegionFreeShippingMinimum(input.cep, client),
    orderTotal: input.pricing.total,
  })
  return { ...quote, options: applyFreeShipping(quote.options, reason) }
}

/**
 * Reads the coupon kept on a cart.
 *
 * @param cartId - Cart id, already checked against the owner.
 * @param client - Prisma client or transaction.
 * @returns The code, or null.
 */
export async function loadCartCoupon(
  cartId: string | null,
  client: Client = prisma
): Promise<string | null> {
  if (!cartId) return null
  const cart = await client.cart.findUnique({
    where: { id: cartId },
    select: { couponCode: true },
  })
  return cart?.couponCode ?? null
}
