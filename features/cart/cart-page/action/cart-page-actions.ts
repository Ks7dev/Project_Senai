"use server"

import { Prisma } from "@/generated/prisma/client"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  activeCartWhere,
  addItemsToCart,
  EMPTY_CART,
  findActiveCartId,
  loadCartExtrasRules,
  loadCartView,
  resolveCartOwner,
} from "@/features/shared/lib/cart/cart-store"
import { isServiceEligible } from "@/features/shared/lib/cart/cart-extras"
import type { CartView } from "@/features/shared/lib/cart/cart-types"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  applyCouponSchema,
  cartShippingSchema,
  removeCartItemSchema,
  saveProjectListSchema,
  setCartItemExtrasSchema,
  updateCartItemSchema,
  type ApplyCouponInput,
  type CartShippingInput,
  type RemoveCartItemInput,
  type SaveProjectListInput,
  type SetCartItemExtrasInput,
  type UpdateCartItemInput,
} from "@/features/cart/cart-page/schema/cart-page-schema"
import type { PromotionsNoteData } from "@/features/shared/components/promotions-note"
import { COUPON_STATUS_MESSAGE } from "@/features/shared/lib/promotions/promotion-math"
import {
  applyShippingBenefits,
  loadCartCoupon,
  priceCart,
  type CartPricing,
} from "@/features/shared/lib/promotions/promotion-service"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { quoteShippingForItems } from "@/features/shared/lib/shipping/shipping-service"
import type { ShippingQuote } from "@/features/shared/lib/shipping/strategies"

/** Promotions of the cart as the cart page shows them (RF46). */
export type CartPromotions = PromotionsNoteData & {
  /** Total discount, decimal string. */
  discount: string
  /** Total after the discount, before shipping, decimal string. */
  total: string
}

/**
 * Maps the pricing to what the cart page shows.
 *
 * @param pricing - Cart pricing.
 * @returns The promotions block.
 */
function toCartPromotions(pricing: CartPricing): CartPromotions {
  return {
    discount: pricing.discount,
    total: pricing.total,
    applied: pricing.applied,
    couponCode: pricing.coupon?.code ?? null,
    couponMessage:
      pricing.coupon && pricing.coupon.status !== "applied"
        ? COUPON_STATUS_MESSAGE[pricing.coupon.status]
        : null,
  }
}

/**
 * Active cart of whoever is browsing, with its promotions. The owner
 * comes from the session or the visitor cookie, never from the request.
 *
 * @returns The cart id (null without a cart), view and pricing.
 */
async function loadOwnCartPricing(): Promise<{
  cartId: string | null
  cart: CartView
  pricing: CartPricing
}> {
  const owner = await resolveCartOwner({ create: false })
  const cartId = owner ? await findActiveCartId(owner) : null
  const cart = cartId ? await loadCartView(cartId) : EMPTY_CART
  const couponCode = await loadCartCoupon(cartId)
  return { cartId, cart, pricing: await priceCart(cart, { couponCode }) }
}

/** Most project lists a customer can keep at once. */
const MAX_PROJECT_LISTS = 50

const ITEM_NOT_FOUND = "Item não encontrado no seu carrinho."

/**
 * Finds a line of the active cart of whoever is browsing. The owner
 * comes from the session or the visitor cookie, never from the request,
 * so nobody changes someone else's cart.
 *
 * @param itemId - Cart item id.
 * @returns The item and its cart id.
 * @throws AppError when the line is not in the caller's cart.
 */
async function findOwnedItem(itemId: string) {
  const owner = await resolveCartOwner({ create: false })
  if (!owner) throw new AppError(ITEM_NOT_FOUND, "not_found")
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: activeCartWhere(owner) },
    select: { id: true, cartId: true },
  })
  if (!item) throw new AppError(ITEM_NOT_FOUND, "not_found")
  return item
}

/**
 * Changes the quantity of a cart line (RF07).
 *
 * @param input - Item id and the new quantity.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function updateCartItem(
  input: UpdateCartItemInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = updateCartItemSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Quantidade inválida.",
        "invalid"
      )
    }
    const item = await findOwnedItem(parsed.data.itemId)
    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: parsed.data.quantity },
    })
    return { success: true, cart: await loadCartView(item.cartId) }
  } catch (error) {
    return toActionError(error, { action: "updateCartItem" })
  }
}

/**
 * Removes a line from the cart (RF07).
 *
 * @param input - Item id.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function removeCartItem(
  input: RemoveCartItemInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = removeCartItemSchema.safeParse(input)
    if (!parsed.success) throw new AppError(ITEM_NOT_FOUND, "invalid")
    const item = await findOwnedItem(parsed.data.itemId)
    await prisma.cartItem.delete({ where: { id: item.id } })
    return { success: true, cart: await loadCartView(item.cartId) }
  } catch (error) {
    return toActionError(error, { action: "removeCartItem" })
  }
}

/**
 * Sets the laser engraving and the additional services of a cart line
 * (RF51, RF52). Only products that accept engraving can be engraved,
 * the text respects the configured length and only eligible services
 * offered in the settings table are accepted. Prices and extra days
 * come from the settings, never from the request.
 *
 * @param input - Item id, engraving (or null) and service keys.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function setCartItemExtras(
  input: SetCartItemExtrasInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = setCartItemExtrasSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a personalização.",
        "invalid"
      )
    }
    const { personalization, services } = parsed.data
    const owned = await findOwnedItem(parsed.data.itemId)
    const [item, rules] = await Promise.all([
      prisma.cartItem.findUniqueOrThrow({
        where: { id: owned.id },
        select: {
          sku: {
            select: {
              product: {
                select: { personalizable: true, requiresInstallation: true },
              },
            },
          },
        },
      }),
      loadCartExtrasRules(),
    ])
    const product = item.sku.product

    if (personalization) {
      if (!product.personalizable) {
        throw new AppError(
          "Este produto não aceita gravação.",
          "not_personalizable"
        )
      }
      if (personalization.text.length > rules.engraving.maxLength) {
        throw new AppError(
          `Use até ${rules.engraving.maxLength} caracteres na gravação.`,
          "engraving_too_long"
        )
      }
    }
    const keys = [...new Set(services)]
    for (const key of keys) {
      const rule = rules.services.find((service) => service.key === key)
      if (!rule || !isServiceEligible(rule, product)) {
        throw new AppError(
          "Serviço indisponível para este produto.",
          "service_unavailable"
        )
      }
    }

    await prisma.cartItem.update({
      where: { id: owned.id },
      data: {
        personalization: personalization ?? Prisma.DbNull,
        services: keys.length > 0 ? keys : Prisma.DbNull,
      },
    })
    return { success: true, cart: await loadCartView(owned.cartId) }
  } catch (error) {
    return toActionError(error, { action: "setCartItemExtras" })
  }
}

/**
 * Saves the current cart as a named project list to resume later
 * (RF07). Only logged-in customers keep lists; the cart itself is left
 * as it is.
 *
 * @param input - List name.
 * @returns `{ success: true, listId }` or `{ success: false, error }`.
 */
export async function saveCartAsProjectList(
  input: SaveProjectListInput
): Promise<ActionResult<{ listId: string }>> {
  try {
    const parsed = saveProjectListSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Nome inválido.",
        "invalid"
      )
    }
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")

    const cartId = await findActiveCartId({ userId: user.id })
    const items = cartId
      ? await prisma.cartItem.findMany({
          where: { cartId },
          orderBy: { createdAt: "asc" },
        })
      : []
    if (items.length === 0) {
      throw new AppError("Seu carrinho está vazio.", "empty_cart")
    }

    const listId = await prisma.$transaction(async (tx) => {
      const lists = await tx.cart.count({
        where: { userId: user.id, kind: "PROJECT_LIST", deletedAt: null },
      })
      if (lists >= MAX_PROJECT_LISTS) {
        throw new AppError(
          `Você já tem ${MAX_PROJECT_LISTS} listas. Exclua uma antes de salvar outra.`,
          "too_many_lists"
        )
      }
      const list = await tx.cart.create({
        data: {
          kind: "PROJECT_LIST",
          name: parsed.data.name,
          userId: user.id,
        },
        select: { id: true },
      })
      await addItemsToCart(
        tx,
        list.id,
        items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          personalization: item.personalization as Prisma.InputJsonValue,
          services: item.services as Prisma.InputJsonValue,
        }))
      )
      return list.id
    })
    return { success: true, listId }
  } catch (error) {
    return toActionError(error, { action: "saveCartAsProjectList" })
  }
}

/**
 * Promotions in force on the active cart (RF46): product and category
 * discounts and the coupon kept on the cart, checked again now.
 *
 * @returns `{ success: true, promotions }` or `{ success: false, error }`.
 */
export async function getCartPromotions(): Promise<
  ActionResult<{ promotions: CartPromotions }>
> {
  try {
    const { pricing } = await loadOwnCartPricing()
    return { success: true, promotions: toCartPromotions(pricing) }
  } catch (error) {
    return toActionError(error, { action: "getCartPromotions" })
  }
}

/**
 * Applies a coupon to the active cart (RF46). Only a coupon in force,
 * whose minimum the cart reaches and that changes the order, is kept on
 * the cart; the checkout checks it again before placing the order.
 *
 * @param input - Coupon code.
 * @returns `{ success: true, promotions }` or `{ success: false, error }`.
 */
export async function applyCartCoupon(
  input: ApplyCouponInput
): Promise<ActionResult<{ promotions: CartPromotions }>> {
  try {
    const parsed = applyCouponSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Código de cupom inválido.",
        "invalid"
      )
    }
    await enforceActionRateLimit("coupon", { limit: 10, windowMs: 60_000 })
    const { cartId, cart } = await loadOwnCartPricing()
    if (!cartId || cart.lines.length === 0) {
      throw new AppError("Seu carrinho está vazio.", "empty_cart")
    }
    const pricing = await priceCart(cart, { couponCode: parsed.data.code })
    const status = pricing.coupon?.status ?? "not_found"
    if (status !== "applied") {
      throw new AppError(COUPON_STATUS_MESSAGE[status], `coupon_${status}`)
    }
    await prisma.cart.update({
      where: { id: cartId },
      data: { couponCode: parsed.data.code },
    })
    return { success: true, promotions: toCartPromotions(pricing) }
  } catch (error) {
    return toActionError(error, { action: "applyCartCoupon" })
  }
}

/**
 * Removes the coupon of the active cart.
 *
 * @returns `{ success: true, promotions }` or `{ success: false, error }`.
 */
export async function removeCartCoupon(): Promise<
  ActionResult<{ promotions: CartPromotions }>
> {
  try {
    const { cartId, cart } = await loadOwnCartPricing()
    if (cartId) {
      await prisma.cart.update({
        where: { id: cartId },
        data: { couponCode: null },
      })
    }
    const pricing = await priceCart(cart, { couponCode: null })
    return { success: true, promotions: toCartPromotions(pricing) }
  } catch (error) {
    return toActionError(error, { action: "removeCartCoupon" })
  }
}

/**
 * Shipping estimate of the active cart for a CEP (RF25), with courtesy
 * shipping of a promotion or the regional free shipping minimum applied
 * (RN23). The lines come from the cart, never from the request.
 *
 * @param input - Destination CEP.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function quoteCartShipping(
  input: CartShippingInput
): Promise<ActionResult<{ quote: ShippingQuote }>> {
  try {
    const parsed = cartShippingSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o CEP.",
        "invalid"
      )
    }
    await enforceActionRateLimit("shipping", { limit: 30, windowMs: 60_000 })
    const { cart, pricing } = await loadOwnCartPricing()
    const items = cart.lines
      .filter((line) => line.purchasable)
      .map((line) => ({ skuCode: line.skuCode, quantity: line.quantity }))
    if (items.length === 0) {
      throw new AppError("Seu carrinho está vazio.", "empty_cart")
    }
    const quote = await quoteShippingForItems({ cep: parsed.data.cep, items })
    return {
      success: true,
      quote: await applyShippingBenefits(quote, {
        pricing,
        cep: parsed.data.cep,
      }),
    }
  } catch (error) {
    return toActionError(error, { action: "quoteCartShipping" })
  }
}
