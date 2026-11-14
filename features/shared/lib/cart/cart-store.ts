import "server-only"
import { randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import type { Prisma } from "@/generated/prisma/client"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  priceLineExtras,
  type CartExtrasRules,
} from "@/features/shared/lib/cart/cart-extras"
import {
  centsToMoney,
  mergeQuantity,
  moneyToCents,
} from "@/features/shared/lib/cart/cart-math"
import type { CartLine, CartView } from "@/features/shared/lib/cart/cart-types"
import { prisma } from "@/features/shared/lib/db/prisma"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  loadCustomerPricing,
  loadVolumeRules,
} from "@/features/shared/lib/pricing/customer-pricing"
import {
  computeVolumeDiscounts,
  customerUnitCents,
  LIST_PRICING,
  type CustomerPricing,
  type VolumeRule,
} from "@/features/shared/lib/pricing/pricing-math"
import { getSetting } from "@/features/shared/lib/settings/settings"
import {
  engravingRuleSchema,
  serviceRulesSchema,
} from "@/features/shared/schema/cart-schema"

/** Cookie with the anonymous cart id of a visitor (httpOnly). */
export const GUEST_CART_COOKIE = "ab_cart"

/** How long a visitor cart is kept in the browser: 30 days. */
const GUEST_CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

/** Visitor tokens are 32 random bytes in base64url. */
const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * Who owns the active cart: the logged-in user (id from the session)
 * or the visitor identified by the cookie token.
 */
export type CartOwner = { userId: string } | { guestToken: string }

type Client = Prisma.TransactionClient | typeof prisma

/** A line being added to a cart. */
export type CartItemInput = {
  /** SKU id. */
  skuId: string
  /** Quantity to add. */
  quantity: number
  /** Personalization chosen for the line (RF51). */
  personalization?: Prisma.InputJsonValue | null
  /** Additional services chosen for the line (RF52). */
  services?: Prisma.InputJsonValue | null
}

/**
 * Reads the visitor cart token from the cookie, ignoring malformed
 * values.
 *
 * @returns The token, or undefined.
 */
export async function readGuestToken(): Promise<string | undefined> {
  const value = (await cookies()).get(GUEST_CART_COOKIE)?.value
  return value && GUEST_TOKEN_PATTERN.test(value) ? value : undefined
}

/**
 * Removes the visitor cart cookie. Only works inside Server Actions;
 * elsewhere the stale cookie is harmless and simply ignored.
 */
export async function clearGuestToken(): Promise<void> {
  try {
    ;(await cookies()).delete(GUEST_CART_COOKIE)
  } catch {
    // Read-only cookie store (rendering): nothing to clean up
  }
}

/**
 * Resolves the owner of the active cart. The user id always comes
 * from the session, never from the request. Visitors are identified by
 * a random token in an httpOnly cookie, created on the first add.
 *
 * @param options - Whether to create the visitor token when missing.
 * @returns The owner, or null for a visitor without a cart.
 */
export async function resolveCartOwner(options: {
  create: boolean
}): Promise<CartOwner | null> {
  const user = await getCurrentUser()
  if (user) return { userId: user.id }
  const guestToken = await readGuestToken()
  if (guestToken) return { guestToken }
  if (!options.create) return null
  const token = randomBytes(32).toString("base64url")
  ;(await cookies()).set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_CART_MAX_AGE_SECONDS,
  })
  return { guestToken: token }
}

/**
 * Prisma filter of the active cart of an owner. A user has one active
 * cart; saved project lists are separate rows (RF07).
 *
 * @param owner - Cart owner.
 * @returns The where clause.
 */
export function activeCartWhere(owner: CartOwner): Prisma.CartWhereInput {
  return "userId" in owner
    ? { userId: owner.userId, kind: "CART", deletedAt: null }
    : { guestToken: owner.guestToken, userId: null, kind: "CART" }
}

/**
 * Finds the active cart of an owner.
 *
 * @param owner - Cart owner.
 * @param client - Prisma client or transaction.
 * @returns The cart id, or null.
 */
export async function findActiveCartId(
  owner: CartOwner,
  client: Client = prisma
): Promise<string | null> {
  const cart = await client.cart.findFirst({
    where: activeCartWhere(owner),
    orderBy: { createdAt: "asc" },
    select: { id: true },
  })
  return cart?.id ?? null
}

/**
 * Finds or creates the active cart of an owner.
 *
 * @param owner - Cart owner.
 * @param client - Prisma client or transaction.
 * @returns The cart id.
 */
export async function getOrCreateActiveCartId(
  owner: CartOwner,
  client: Client = prisma
): Promise<string> {
  const existing = await findActiveCartId(owner, client)
  if (existing) return existing
  const cart = await client.cart.create({
    data:
      "userId" in owner
        ? { kind: "CART", userId: owner.userId }
        : { kind: "CART", guestToken: owner.guestToken },
    select: { id: true },
  })
  return cart.id
}

/**
 * Adds lines to a cart or list. A SKU already present has its quantity
 * summed (up to the line limit); its personalization and services are
 * kept, or taken from the new line when the existing one has none.
 *
 * @param client - Prisma transaction.
 * @param cartId - Target cart or list.
 * @param items - Lines to add.
 */
export async function addItemsToCart(
  client: Client,
  cartId: string,
  items: CartItemInput[]
): Promise<void> {
  for (const item of items) {
    const existing = await client.cartItem.findUnique({
      where: { cartId_skuId: { cartId, skuId: item.skuId } },
    })
    if (existing) {
      await client.cartItem.update({
        where: { id: existing.id },
        data: {
          quantity: mergeQuantity(existing.quantity, item.quantity),
          ...(existing.personalization === null && item.personalization
            ? { personalization: item.personalization }
            : {}),
          ...(existing.services === null && item.services
            ? { services: item.services }
            : {}),
        },
      })
    } else {
      await client.cartItem.create({
        data: {
          cartId,
          skuId: item.skuId,
          quantity: mergeQuantity(0, item.quantity),
          personalization: item.personalization ?? undefined,
          services: item.services ?? undefined,
        },
      })
    }
  }
}

/**
 * Moves the visitor cart into the account cart at login, so nothing
 * chosen before logging in is lost (RF07, #46). The visitor cart row is
 * locked with `SELECT ... FOR UPDATE` (justified raw query: Prisma has
 * no row lock), so two concurrent logins never add the items twice.
 *
 * @param userId - User id, from the session or the sign-in result.
 * @param guestToken - Visitor cart token from the cookie.
 * @returns How many lines were moved.
 */
export async function mergeGuestCart(
  userId: string,
  guestToken: string
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM carts
      WHERE guest_token = ${guestToken} AND user_id IS NULL
      FOR UPDATE`
    const guestCartId = locked[0]?.id
    if (!guestCartId) return 0
    const items = await tx.cartItem.findMany({
      where: { cartId: guestCartId },
      orderBy: { createdAt: "asc" },
    })
    if (items.length > 0) {
      const cartId = await getOrCreateActiveCartId({ userId }, tx)
      await addItemsToCart(
        tx,
        cartId,
        items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          personalization: item.personalization as Prisma.InputJsonValue,
          services: item.services as Prisma.InputJsonValue,
        }))
      )
    }
    await tx.cart.delete({ where: { id: guestCartId } })
    return items.length
  })
}

/**
 * Merges the visitor cart of the cookie into the account cart right
 * after login and removes the cookie. Never fails the login: errors
 * are logged and the visitor cart stays for the next attempt.
 *
 * @param userId - Id of the user who just logged in.
 */
export async function mergeGuestCartAfterLogin(userId: string): Promise<void> {
  try {
    const guestToken = await readGuestToken()
    if (!guestToken) return
    const moved = await mergeGuestCart(userId, guestToken)
    await clearGuestToken()
    if (moved > 0) logger.info("guest cart merged", { userId, lines: moved })
  } catch (error) {
    logger.error("guest cart merge failed", { userId, error })
  }
}

/**
 * Whether a SKU can be bought now: active variation of a published
 * product (RF42).
 *
 * @returns The Prisma filter.
 */
export function purchasableSkuWhere(): Prisma.SkuWhereInput {
  return {
    active: true,
    product: { status: "ACTIVE", deletedAt: null, category: { active: true } },
  }
}

/** Cart item query shape used to build the cart lines. */
export const cartItemInclude = {
  sku: {
    include: {
      product: {
        include: {
          category: { select: { id: true, name: true, active: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { storageKey: true },
          },
        },
      },
    },
  },
} satisfies Prisma.CartItemInclude

/** A cart item loaded with its SKU and product. */
export type LoadedCartItem = Prisma.CartItemGetPayload<{
  include: typeof cartItemInclude
}>

/**
 * Reads the engraving and additional service rules from the settings
 * table (RF51, RF52); prices and extra days are never fixed in code.
 *
 * @param client - Prisma client or transaction.
 * @returns The rules.
 */
export async function loadCartExtrasRules(
  client: Client = prisma
): Promise<CartExtrasRules> {
  const [engraving, services] = await Promise.all([
    getSetting("personalization.engraving", client),
    getSetting("cart.additional_services", client),
  ])
  return {
    engraving: engravingRuleSchema.parse(engraving),
    services: serviceRulesSchema.parse(services),
  }
}

/**
 * Builds a cart line with the current price of the customer table
 * (RF21) and the priced extras. Prices are never stored in the cart:
 * they are always read from the catalog, the customer table and the
 * settings table.
 *
 * @param item - Loaded cart item.
 * @param rules - Engraving and service rules.
 * @param pricing - Price table of the cart owner (catalog price when
 *   omitted).
 * @returns The line.
 */
export function toCartLine(
  item: LoadedCartItem,
  rules: CartExtrasRules,
  pricing: CustomerPricing = LIST_PRICING
): CartLine {
  const { sku } = item
  const { product } = sku
  const listCents = moneyToCents((sku.price ?? product.basePrice).toFixed(2))
  const unitCents = customerUnitCents(listCents, pricing, product.id)
  const extras = priceLineExtras(
    {
      quantity: item.quantity,
      personalizable: product.personalizable,
      requiresInstallation: product.requiresInstallation,
      personalization: item.personalization,
      services: item.services,
    },
    rules
  )
  return {
    id: item.id,
    skuCode: sku.code,
    skuName: sku.name,
    productName: product.name,
    productSlug: product.slug,
    imageKey: product.images[0]?.storageKey ?? null,
    categoryId: product.category.id,
    categoryName: product.category.name,
    quantity: item.quantity,
    unitPrice: centsToMoney(unitCents),
    listUnitPrice: unitCents < listCents ? centsToMoney(listCents) : null,
    total: centsToMoney(unitCents * item.quantity),
    purchasable:
      sku.active &&
      product.status === "ACTIVE" &&
      product.deletedAt === null &&
      product.category.active,
    personalizable: product.personalizable,
    requiresInstallation: product.requiresInstallation,
    ...extras,
  }
}

/** Pricing context of a cart summary. */
export type CartPricingOptions = {
  /** Active volume discount rules (RN04); none when omitted. */
  volumeRules?: VolumeRule[]
  /** Name of the customer price table (RF21), or null. */
  priceTableName?: string | null
}

/**
 * Sums the purchasable lines with their extras (RF51, RF52) and applies
 * the automatic volume discounts of each category (RN04) over the
 * product amounts; engraving and services are never discounted. Lines
 * that left the catalog stay visible but do not count.
 *
 * @param lines - Cart lines.
 * @param options - Volume rules and price table name.
 * @returns The cart view.
 */
export function summarizeLines(
  lines: CartLine[],
  options: CartPricingOptions = {}
): CartView {
  const purchasable = lines.filter((line) => line.purchasable)
  const subtotal = purchasable.reduce(
    (sum, line) => sum + moneyToCents(line.total),
    0
  )
  const services = purchasable.reduce(
    (sum, line) => sum + moneyToCents(line.extrasTotal),
    0
  )
  const volume = computeVolumeDiscounts(
    purchasable.map((line) => ({
      categoryId: line.categoryId,
      quantity: line.quantity,
      totalCents: moneyToCents(line.total),
    })),
    options.volumeRules ?? []
  )
  const discount = volume.reduce((sum, item) => sum + item.discountCents, 0)
  return {
    lines,
    count: purchasable.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: centsToMoney(subtotal),
    discount: centsToMoney(discount),
    volumeDiscounts: volume.map((item) => ({
      categoryName: item.categoryName,
      basisPoints: item.basisPoints,
      quantity: item.quantity,
      amount: centsToMoney(item.discountCents),
    })),
    priceTableName: options.priceTableName ?? null,
    servicesTotal: centsToMoney(services),
    total: centsToMoney(subtotal - discount + services),
    // Lines are produced in parallel: the order waits for the longest
    extraBusinessDays: Math.max(
      0,
      ...purchasable.map((line) => line.extraBusinessDays)
    ),
  }
}

/**
 * Prices loaded cart items for their owner: the customer table (RF21)
 * on each line and the volume discounts (RN04) on the totals.
 *
 * @param items - Loaded cart items.
 * @param context - Extras rules, customer pricing and volume rules.
 * @returns The cart view.
 */
export function buildCartView(
  items: LoadedCartItem[],
  context: {
    rules: CartExtrasRules
    pricing: CustomerPricing
    volumeRules: VolumeRule[]
  }
): CartView {
  return summarizeLines(
    items.map((item) => toCartLine(item, context.rules, context.pricing)),
    {
      volumeRules: context.volumeRules,
      priceTableName: context.pricing.tableName,
    }
  )
}

/**
 * Loads a cart or list with its lines, priced for its owner: the price
 * table of the customer (RF21) and the automatic volume discounts
 * (RN04). Visitor carts get the catalog price.
 *
 * @param cartId - Cart or list id, already checked against the owner.
 * @param client - Prisma client or transaction.
 * @returns The cart view.
 */
export async function loadCartView(
  cartId: string,
  client: Client = prisma
): Promise<CartView> {
  const [cart, items, rules, volumeRules] = await Promise.all([
    client.cart.findUnique({ where: { id: cartId }, select: { userId: true } }),
    client.cartItem.findMany({
      where: { cartId },
      include: cartItemInclude,
      orderBy: { createdAt: "asc" },
    }),
    loadCartExtrasRules(client),
    loadVolumeRules(client),
  ])
  const pricing = await loadCustomerPricing(cart?.userId ?? null, client)
  return buildCartView(items, { rules, pricing, volumeRules })
}

/** An empty cart. */
export const EMPTY_CART: CartView = {
  lines: [],
  count: 0,
  subtotal: "0.00",
  discount: "0.00",
  volumeDiscounts: [],
  priceTableName: null,
  servicesTotal: "0.00",
  total: "0.00",
  extraBusinessDays: 0,
}

/**
 * Loads the active cart of whoever is browsing: the account cart when
 * logged in, the visitor cart otherwise. Used by the header drawer and
 * the cart page.
 *
 * @returns The cart view (empty when there is no cart yet).
 */
export async function loadCurrentCart(): Promise<CartView> {
  const owner = await resolveCartOwner({ create: false })
  if (!owner) return EMPTY_CART
  const cartId = await findActiveCartId(owner)
  return cartId ? loadCartView(cartId) : EMPTY_CART
}
