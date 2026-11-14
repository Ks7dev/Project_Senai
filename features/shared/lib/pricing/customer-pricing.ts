import "server-only"
import { unstable_rethrow } from "next/navigation"
import type { Prisma } from "@/generated/prisma/client"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  centsToMoney,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"
import type { ProductCardData } from "@/features/shared/lib/catalog/catalog-query"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  customerUnitCents,
  LIST_PRICING,
  percentToBasisPoints,
  type CustomerPricing,
  type VolumeRule,
} from "@/features/shared/lib/pricing/pricing-math"

type Client = Prisma.TransactionClient | typeof prisma

/** A price as the store shows it to the customer. */
export type CustomerPrice = {
  /** Price for the customer, decimal string. */
  price: string
  /** Catalog price when the customer table lowers it, otherwise null. */
  listPrice: string | null
}

/** A volume discount tier as the store shows it (RN04). */
export type VolumeTier = {
  /** Minimum units, or null. */
  minQuantity: number | null
  /** Minimum amount, decimal string, or null. */
  minAmount: string | null
  /** Discount in basis points. */
  basisPoints: number
}

/**
 * Id of the price table of a customer (RF21). Members of a corporate
 * account use the table of the account; PF customers use their own.
 *
 * @param userId - Customer id, from the session or from the cart owner.
 * @param client - Prisma client or transaction.
 * @returns The table id, or null.
 */
async function customerTableId(
  userId: string,
  client: Client
): Promise<string | null> {
  const member = await client.member.findFirst({
    where: { userId, organization: { deletedAt: null } },
    orderBy: { createdAt: "asc" },
    select: { organization: { select: { priceTableId: true } } },
  })
  if (member) return member.organization.priceTableId
  const user = await client.user.findUnique({
    where: { id: userId },
    select: { priceTableId: true },
  })
  return user?.priceTableId ?? null
}

/**
 * Loads the price table of a customer (RF21). Visitors, customers
 * without a table and inactive or removed tables get the catalog price.
 *
 * @param userId - Customer id (never taken from the request), or null.
 * @param client - Prisma client or transaction.
 * @returns The customer pricing.
 */
export async function loadCustomerPricing(
  userId: string | null,
  client: Client = prisma
): Promise<CustomerPricing> {
  if (!userId) return LIST_PRICING
  const tableId = await customerTableId(userId, client)
  if (!tableId) return LIST_PRICING
  const table = await client.priceTable.findFirst({
    where: { id: tableId, active: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      discountPercent: true,
      items: { select: { productId: true, discountPercent: true } },
    },
  })
  if (!table) return LIST_PRICING
  return {
    tableId: table.id,
    tableName: table.name,
    defaultBasisPoints: percentToBasisPoints(table.discountPercent.toFixed(2)),
    productBasisPoints: new Map(
      table.items.map((item) => [
        item.productId,
        percentToBasisPoints(item.discountPercent.toFixed(2)),
      ])
    ),
  }
}

/**
 * Pricing of whoever is browsing, with the user from the session. A
 * failure falls back to the catalog price: the cart and the checkout
 * price again on the server, so nothing is sold at the wrong price.
 *
 * @returns The customer pricing.
 */
export async function loadCurrentCustomerPricing(): Promise<CustomerPricing> {
  try {
    const user = await getCurrentUser()
    return await loadCustomerPricing(user?.id ?? null)
  } catch (error) {
    // Next.js control flow (prerendering) must reach the framework
    unstable_rethrow(error)
    logger.error("customer pricing failed", { error })
    return LIST_PRICING
  }
}

/**
 * Price of a product for the customer (RF21).
 *
 * @param listPrice - Catalog price, decimal string.
 * @param productId - Product id.
 * @param pricing - Customer pricing.
 * @returns The customer price and, when lower, the catalog price.
 */
export function customerPrice(
  listPrice: string,
  productId: string,
  pricing: CustomerPricing
): CustomerPrice {
  const listCents = moneyToCents(listPrice)
  const cents = customerUnitCents(listCents, pricing, productId)
  return {
    price: centsToMoney(cents),
    listPrice: cents < listCents ? centsToMoney(listCents) : null,
  }
}

/**
 * Applies the customer table to product cards (listing, search, home,
 * favorites and comparison). The cards come from the shared cache with
 * the catalog price; the customer price is applied per request.
 *
 * @param cards - Cards with the catalog price.
 * @param pricing - Customer pricing.
 * @returns The cards with the customer price.
 */
export function priceCards<T extends ProductCardData>(
  cards: T[],
  pricing: CustomerPricing
): T[] {
  if (pricing.tableId === null) return cards
  return cards.map((card): T => ({
    ...card,
    ...customerPrice(card.price, card.id, pricing),
  }))
}

/**
 * Applies the table of the logged-in customer to product cards.
 *
 * @param cards - Cards with the catalog price.
 * @returns The cards with the customer price.
 */
export async function priceCardsForCurrentCustomer<T extends ProductCardData>(
  cards: T[]
): Promise<T[]> {
  if (cards.length === 0) return cards
  return priceCards(cards, await loadCurrentCustomerPricing())
}

/**
 * Active volume discount rules of active categories (RN04).
 *
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadVolumeRules(
  client: Client = prisma
): Promise<VolumeRule[]> {
  const rows = await client.volumeDiscount.findMany({
    where: { active: true, deletedAt: null, category: { active: true } },
    select: {
      id: true,
      categoryId: true,
      minQuantity: true,
      minAmount: true,
      discountPercent: true,
      category: { select: { name: true } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    categoryId: row.categoryId,
    categoryName: row.category.name,
    minQuantity: row.minQuantity,
    minAmountCents: row.minAmount
      ? moneyToCents(row.minAmount.toFixed(2))
      : null,
    basisPoints: percentToBasisPoints(row.discountPercent.toFixed(2)),
  }))
}

/**
 * Volume discount tiers of a category, shown on the product page so the
 * customer knows the discount before adding to the cart (RN04).
 *
 * @param categorySlug - Category slug.
 * @returns The tiers, smallest discount first; empty on failure.
 */
export async function loadVolumeTiers(
  categorySlug: string
): Promise<VolumeTier[]> {
  try {
    const rows = await prisma.volumeDiscount.findMany({
      where: {
        active: true,
        deletedAt: null,
        category: { slug: categorySlug, active: true },
      },
      orderBy: { discountPercent: "asc" },
      select: { minQuantity: true, minAmount: true, discountPercent: true },
    })
    return rows
      .filter((row) => row.minQuantity !== null || row.minAmount !== null)
      .map((row) => ({
        minQuantity: row.minQuantity,
        minAmount: row.minAmount?.toFixed(2) ?? null,
        basisPoints: percentToBasisPoints(row.discountPercent.toFixed(2)),
      }))
  } catch (error) {
    unstable_rethrow(error)
    logger.error("volume tiers failed", { error })
    return []
  }
}
