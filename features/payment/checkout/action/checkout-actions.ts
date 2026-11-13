"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  checkoutQuoteSchema,
  placeOrderSchema,
  type CheckoutPaymentMethod,
  type CheckoutQuoteInput,
  type PlaceOrderInput,
} from "@/features/payment/checkout/schema/checkout-schema"
import {
  addressLine,
  toAddressSnapshot,
  type AddressSnapshot,
} from "@/features/shared/lib/addresses/address-snapshot"
import { hasCorporatePermission } from "@/features/shared/lib/auth/corporate-roles"
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/shared/lib/auth/session"
import {
  EMPTY_CART,
  findActiveCartId,
  loadCartView,
} from "@/features/shared/lib/cart/cart-store"
import type { CartView } from "@/features/shared/lib/cart/cart-types"
import { writeAudit } from "@/features/shared/lib/db/audit"
import {
  addDaysToKey,
  buildInstallationCalendar,
  earliestInstallationDate,
  installationLeadDays,
  scheduledAtFromKey,
  unavailableReason,
  type DateKey,
  type InstallationRules,
  type ScheduleDay,
} from "@/features/shared/lib/delivery/installation-calendar"
import {
  countScheduledByDate,
  loadInstallationRules,
  lockInstallationAgenda,
} from "@/features/shared/lib/delivery/installation-schedule"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import {
  FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enqueueOrderStatusEmails } from "@/features/shared/lib/orders/order-notifications"
import {
  isRetryableOrderError,
  nextOrderNumber,
} from "@/features/shared/lib/orders/order-number"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import { loadPaymentDeadlines } from "@/features/shared/lib/payments/payment-deadlines"
import { PAYMENT_METHOD_LABEL } from "@/features/shared/lib/payments/payment-messages"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"
import {
  loadManualQuoteResponseDays,
  notifyManualQuoteRequested,
  type ManualQuoteData,
} from "@/features/shared/lib/shipping/manual-quote"
import { quoteShippingForItems } from "@/features/shared/lib/shipping/shipping-service"
import {
  fromCents,
  toCents,
  type ManualQuoteReason,
  type ShippingCoverage,
  type ShippingOption,
  type ShippingQuote,
} from "@/features/shared/lib/shipping/strategies"
import { reserveStock } from "@/features/shared/lib/stock/stock-service"

/** A saved address the customer may deliver to. */
export type CheckoutAddress = {
  /** Address id. */
  id: string
  /** Nickname, e.g. "Matriz". */
  label: string
  /** One-line address. */
  line: string
}

/** A payment method offered at checkout, with what the customer should know. */
export type CheckoutPaymentOption = {
  /** Method key. */
  method: CheckoutPaymentMethod
  /** Label, in Portuguese. */
  label: string
  /** Short note (security, expiration, installments). */
  note: string
}

/** What the checkout page shows. */
export type CheckoutContext = {
  /** Active cart with its totals. */
  cart: CartView
  /** Saved addresses of the account (of the company for PJ members). */
  addresses: CheckoutAddress[]
  /** Whether the buyer orders for a corporate account. */
  corporate: boolean
  /** Approval limit of corporate orders (RN01), decimal string. */
  approvalLimit: string | null
  /** Payment methods offered (RF29). */
  paymentMethods: CheckoutPaymentOption[]
  /** Delivery and installation scheduling of the cart (RF16, RN05). */
  installation: {
    /** Whether a line needs installation, so a date is required. */
    required: boolean
    /** Products that need installation. */
    products: string[]
  }
}

/** A shipping option with the order total it gives. */
export type CheckoutOption = ShippingOption & {
  /** Order total with this option, decimal string. */
  total: string
  /**
   * First installation date with this option (RN05), or null when the
   * cart needs no installation.
   */
  earliestInstallationDate: DateKey | null
}

/** Shipping of the cart to the chosen address. */
export type CheckoutQuote = {
  /** Delivery address, one line. */
  address: string
  /**
   * Delivery and installation calendar, with the blocked dates (RN05);
   * null when the cart needs no installation.
   */
  schedule: ScheduleDay[] | null
  /** Whether the address is inside the own delivery area (RF27). */
  coverage: ShippingCoverage
} & (
  | { status: "quoted"; options: CheckoutOption[] }
  | {
      status: "manual_quote"
      /** Why the sales team must quote. */
      reason: ManualQuoteReason
      /** Return time of the sales team, in business days. */
      responseBusinessDays: number
      /** Order total without shipping until the sales team quotes. */
      total: string
    }
)

/** Order placed at checkout. */
export type PlacedOrder = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Status after the checkout. */
  status: OrderStatusKey
  /** Order total, decimal string. */
  total: string
  /** Where the customer goes next. */
  nextUrl: string
}

/** Message when the cart has nothing to buy. */
const EMPTY_CART_MESSAGE = "Seu carrinho está vazio."

/** Message when a line left the catalog. */
const UNAVAILABLE_LINE_MESSAGE =
  "Há itens indisponíveis no carrinho. Remova-os para finalizar a compra."

/** Message when prices or shipping moved since the review. */
const PRICES_CHANGED_MESSAGE =
  "Os valores do pedido mudaram desde a revisão. Confira o novo total antes de confirmar."

/** Message when an installation order has no date (RN05). */
const INSTALLATION_DATE_REQUIRED_MESSAGE =
  "Escolha a data de entrega e instalação para finalizar o pedido."

/** Message when the chosen installation date is blocked (RN05). */
const INSTALLATION_DATE_UNAVAILABLE_MESSAGE =
  "A data de entrega e instalação escolhida não está disponível. Escolha outra data."

/** How many times a conflicting order number is retried. */
const ORDER_NUMBER_ATTEMPTS = 3

/** The buyer of the checkout. */
type Buyer = {
  /** Session user. */
  user: SessionUser
  /** Corporate account the order belongs to, if any (RF10). */
  organizationId: string | null
}

/**
 * Logged-in buyer, from the session (never from the request). A member
 * of a corporate account must hold a role that places orders (RF10).
 *
 * @returns The buyer.
 * @throws AppError("unauthenticated") or AppError("forbidden").
 */
async function loadBuyer(): Promise<Buyer> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const corporate = await getCorporateContext()
  if (corporate && !hasCorporatePermission(corporate.roles, "order:create")) {
    throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
  }
  return { user, organizationId: corporate?.organizationId ?? null }
}

/**
 * Filter of the addresses the buyer may deliver to: of the company for
 * corporate members (RF26), of the customer otherwise.
 *
 * @param buyer - Buyer.
 * @returns The where clause.
 */
function addressScope(buyer: Buyer): Prisma.AddressWhereInput {
  return {
    deletedAt: null,
    ...(buyer.organizationId
      ? { organizationId: buyer.organizationId }
      : { userId: buyer.user.id }),
  }
}

/**
 * Loads a saved address of the buyer.
 *
 * @param buyer - Buyer.
 * @param addressId - Address id from the request.
 * @returns The snapshot stored on the order.
 * @throws AppError("address_not_found").
 */
async function loadBuyerAddress(
  buyer: Buyer,
  addressId: string
): Promise<AddressSnapshot> {
  const address = await prisma.address.findFirst({
    where: { id: addressId, ...addressScope(buyer) },
  })
  if (!address) {
    throw new AppError(
      "Escolha um dos endereços cadastrados na sua conta.",
      "address_not_found"
    )
  }
  return toAddressSnapshot(address)
}

/**
 * Loads the active cart of the buyer.
 *
 * @param userId - Session user id.
 * @param client - Prisma client or transaction.
 * @returns The cart id and view.
 */
async function loadBuyerCart(
  userId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<{ cartId: string | null; cart: CartView }> {
  const cartId = await findActiveCartId({ userId }, client)
  return {
    cartId,
    cart: cartId ? await loadCartView(cartId, client) : EMPTY_CART,
  }
}

/**
 * Refuses an empty cart or one with lines that left the catalog.
 *
 * @param cart - Cart view.
 * @throws AppError("empty_cart") or AppError("unavailable_line").
 */
function assertCartReady(cart: CartView): void {
  if (cart.lines.length === 0) {
    throw new AppError(EMPTY_CART_MESSAGE, "empty_cart")
  }
  if (cart.lines.some((line) => !line.purchasable)) {
    throw new AppError(UNAVAILABLE_LINE_MESSAGE, "unavailable_line")
  }
}

/**
 * Products of the cart that need installation (RN05), without repeats.
 *
 * @param cart - Cart view.
 * @returns The product names.
 */
function installationProducts(cart: CartView): string[] {
  return [
    ...new Set(
      cart.lines
        .filter((line) => line.purchasable && line.requiresInstallation)
        .map((line) => line.productName)
    ),
  ]
}

/**
 * Delivery and installation calendar of the cart (RN05), from the first
 * date the preparation and the extras allow.
 *
 * @param cart - Cart view.
 * @param now - Current time.
 * @returns The rules and the calendar.
 */
async function loadInstallationCalendar(
  cart: CartView,
  now: Date
): Promise<{ rules: InstallationRules; calendar: ScheduleDay[] }> {
  const rules = await loadInstallationRules()
  const leadBusinessDays = installationLeadDays(
    rules,
    cart.extraBusinessDays,
    null
  )
  const first = earliestInstallationDate(now, leadBusinessDays)
  const booked = await countScheduledByDate(
    first,
    addDaysToKey(first, rules.windowDays - 1)
  )
  return {
    rules,
    calendar: buildInstallationCalendar({
      now,
      leadBusinessDays,
      rules,
      booked,
    }),
  }
}

/**
 * Payment methods offered at checkout (RF29).
 *
 * @returns The options.
 */
async function paymentOptions(): Promise<CheckoutPaymentOption[]> {
  const { pixMinutes, boletoBusinessDays } = await loadPaymentDeadlines()
  return [
    {
      method: "CARD",
      label: PAYMENT_METHOD_LABEL.CARD,
      note: "Os dados do cartão são digitados no formulário seguro do Mercado Pago e não passam pelos nossos servidores.",
    },
    {
      method: "PIX",
      label: PAYMENT_METHOD_LABEL.PIX,
      note: `O código Pix vale por ${pixMinutes} minutos. Sem pagamento nesse prazo, o pedido é cancelado e os itens voltam ao estoque.`,
    },
    {
      method: "BOLETO",
      label: PAYMENT_METHOD_LABEL.BOLETO,
      note: `O boleto vence em ${boletoBusinessDays} ${boletoBusinessDays === 1 ? "dia útil" : "dias úteis"}. Sem pagamento nesse prazo, o pedido é cancelado e os itens voltam ao estoque.`,
    },
  ]
}

/**
 * Quotes the shipping of the cart lines to a CEP (RF25, RN20).
 *
 * @param cart - Cart view.
 * @param cep - Destination CEP.
 * @returns The quote.
 */
async function quoteCart(cart: CartView, cep: string): Promise<ShippingQuote> {
  return quoteShippingForItems({
    cep,
    items: cart.lines.map((line) => ({
      skuCode: line.skuCode,
      quantity: line.quantity,
    })),
  })
}

/**
 * Whether two options are the same carrier service.
 *
 * @param a - Option.
 * @param b - Chosen option.
 * @returns True when method, carrier and service match.
 */
function sameOption(
  a: Pick<ShippingOption, "method" | "carrier" | "service">,
  b: Pick<ShippingOption, "method" | "carrier" | "service">
): boolean {
  return (
    a.method === b.method && a.carrier === b.carrier && a.service === b.service
  )
}

/**
 * Loads what the checkout page shows: the cart, the saved addresses and
 * the payment methods (RF29). The user comes from the session.
 *
 * @returns `{ success: true, context }` or `{ success: false, error }`.
 */
export async function getCheckout(): Promise<
  ActionResult<{ context: CheckoutContext }>
> {
  try {
    const buyer = await loadBuyer()
    const [{ cart }, addresses, paymentMethods] = await Promise.all([
      loadBuyerCart(buyer.user.id),
      prisma.address.findMany({
        where: addressScope(buyer),
        orderBy: [{ isDefault: "desc" }, { label: "asc" }],
      }),
      paymentOptions(),
    ])
    const approvalLimit = buyer.organizationId
      ? (await getNumberSetting("order.approval_limit")).toFixed(2)
      : null
    return {
      success: true,
      context: {
        cart,
        addresses: addresses.map((address) => ({
          id: address.id,
          label: address.label,
          line: addressLine(address),
        })),
        corporate: buyer.organizationId !== null,
        approvalLimit,
        paymentMethods,
        installation: {
          required: installationProducts(cart).length > 0,
          products: installationProducts(cart),
        },
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getCheckout" })
  }
}

/**
 * Quotes the shipping of the cart to a saved address (RF25, RN20), with
 * the order total of each option. Nothing is saved.
 *
 * @param input - Address id.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function quoteCheckoutShipping(
  input: CheckoutQuoteInput
): Promise<ActionResult<{ quote: CheckoutQuote }>> {
  try {
    const parsed = checkoutQuoteSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o endereço.",
        "invalid"
      )
    }
    const buyer = await loadBuyer()
    await enforceActionRateLimit("shipping", { limit: 30, windowMs: 60_000 })
    const address = await loadBuyerAddress(buyer, parsed.data.addressId)
    const { cart } = await loadBuyerCart(buyer.user.id)
    assertCartReady(cart)
    const quote = await quoteCart(cart, address.cep)
    const base = toCents(cart.total)
    const now = new Date()
    const schedule =
      installationProducts(cart).length > 0
        ? await loadInstallationCalendar(cart, now)
        : null
    if (quote.status === "manual_quote") {
      return {
        success: true,
        quote: {
          address: addressLine(address),
          schedule: schedule?.calendar ?? null,
          coverage: quote.coverage,
          status: "manual_quote",
          reason: quote.reason,
          responseBusinessDays:
            quote.responseBusinessDays ?? (await loadManualQuoteResponseDays()),
          total: fromCents(base),
        },
      }
    }
    return {
      success: true,
      quote: {
        address: addressLine(address),
        schedule: schedule?.calendar ?? null,
        coverage: quote.coverage,
        status: "quoted",
        options: quote.options.map((option) => ({
          ...option,
          total: fromCents(base + toCents(option.price)),
          earliestInstallationDate: schedule
            ? earliestInstallationDate(
                now,
                installationLeadDays(
                  schedule.rules,
                  cart.extraBusinessDays,
                  option.deliveryDays
                )
              )
            : null,
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "quoteCheckoutShipping" })
  }
}

/**
 * Places the order of the active cart (RF28, RF43, RN01, RN13, RN20).
 * The shipping is quoted again on the server and the order only goes on
 * when the chosen option and the total are still what the customer saw.
 * In one transaction it numbers the order, copies the lines with their
 * prices and extras, reserves the stock with `SELECT ... FOR UPDATE`,
 * stores the shipment, records the first status, empties the cart and
 * writes the audit log (RNF12). The order then waits for:
 * - the payment (card, Pix, boleto), confirmed only by Mercado Pago;
 * - the company approval, above the approval limit (RN01);
 * - the sales team, when no shipping API answered (RN20).
 * A cart with furniture that needs installation only goes on with a
 * delivery and installation date that is still free (RF16, RN05); the
 * agenda is locked so two orders never take the last slot of a date.
 *
 * @param input - Address, shipping option, payment method, amounts seen
 *   and installation date.
 * @returns `{ success: true, order }` or `{ success: false, error }`.
 */
export async function placeOrder(
  input: PlaceOrderInput
): Promise<ActionResult<{ order: PlacedOrder }>> {
  try {
    const parsed = placeOrderSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o pedido.",
        "invalid"
      )
    }
    const data = parsed.data
    const buyer = await loadBuyer()
    await enforceActionRateLimit("checkout", { limit: 10, windowMs: 60_000 })
    const methods = await paymentOptions()
    if (!methods.some((option) => option.method === data.paymentMethod)) {
      throw new AppError("Escolha a forma de pagamento.", "invalid_method")
    }
    const address = await loadBuyerAddress(buyer, data.addressId)
    const preview = await loadBuyerCart(buyer.user.id)
    assertCartReady(preview.cart)
    if (
      installationProducts(preview.cart).length > 0 &&
      !data.installationDate
    ) {
      throw new AppError(
        INSTALLATION_DATE_REQUIRED_MESSAGE,
        "installation_date_required"
      )
    }
    // The APIs are called outside the transaction, so no row stays
    // locked while they answer
    const quote = await quoteCart(preview.cart, address.cep)

    let chosen: ShippingOption | null = null
    if (data.option) {
      const wanted = data.option
      chosen =
        quote.status === "quoted"
          ? (quote.options.find((option) => sameOption(option, wanted)) ?? null)
          : null
      if (!chosen || chosen.price !== data.expectedShippingPrice) {
        throw new AppError(PRICES_CHANGED_MESSAGE, "quote_changed")
      }
    } else if (
      quote.status !== "manual_quote" ||
      data.expectedShippingPrice !== "0.00"
    ) {
      throw new AppError(PRICES_CHANGED_MESSAGE, "quote_changed")
    }
    const manualReason: ManualQuoteReason | null =
      quote.status === "manual_quote" ? quote.reason : null

    const now = new Date()
    const run = () =>
      prisma.$transaction(async (tx) => {
        // Lock the cart (justified raw query: Prisma has no row lock), so
        // a double click never places the same cart twice
        const cartId = preview.cartId!
        await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId} FOR UPDATE`
        const cart = await loadCartView(cartId, tx)
        assertCartReady(cart)

        const shipping = chosen ? chosen.price : "0.00"
        const total = fromCents(toCents(cart.total) + toCents(shipping))
        if (total !== data.expectedTotal) {
          throw new AppError(PRICES_CHANGED_MESSAGE, "prices_changed")
        }
        let scheduledDeliveryAt: Date | null = null
        if (installationProducts(cart).length > 0) {
          const date = data.installationDate
          if (!date) {
            throw new AppError(
              INSTALLATION_DATE_REQUIRED_MESSAGE,
              "installation_date_required"
            )
          }
          await lockInstallationAgenda(tx)
          const rules = await loadInstallationRules(tx)
          const reason = unavailableReason(date, {
            now,
            leadBusinessDays: installationLeadDays(
              rules,
              cart.extraBusinessDays,
              chosen?.deliveryDays ?? null
            ),
            rules,
            booked: await countScheduledByDate(date, date, tx),
          })
          if (reason) {
            throw new AppError(
              INSTALLATION_DATE_UNAVAILABLE_MESSAGE,
              "installation_date_unavailable"
            )
          }
          scheduledDeliveryAt = scheduledAtFromKey(date)
        }

        const approvalLimit = await getNumberSetting("order.approval_limit", tx)
        const requiresApproval =
          buyer.organizationId !== null && Number(total) > approvalLimit
        const status: OrderStatusKey = manualReason
          ? "AWAITING_SHIPPING_QUOTE"
          : requiresApproval
            ? "AWAITING_APPROVAL"
            : "AWAITING_PAYMENT"

        const skus = await tx.sku.findMany({
          where: { code: { in: cart.lines.map((line) => line.skuCode) } },
          select: { id: true, code: true },
        })
        const skuIds = new Map(skus.map((sku) => [sku.code, sku.id]))
        const number = await nextOrderNumber(tx, now)
        const order = await tx.order.create({
          data: {
            number,
            userId: buyer.user.id,
            organizationId: buyer.organizationId,
            status,
            paymentMethod: data.paymentMethod,
            subtotal: cart.subtotal,
            servicesTotal: cart.servicesTotal,
            shippingTotal: shipping,
            total,
            shippingAddress: address,
            scheduledDeliveryAt,
            extraLeadBusinessDays: cart.extraBusinessDays,
            requiresApproval,
            createdAt: now,
            items: {
              create: cart.lines.map((line) => ({
                skuId: skuIds.get(line.skuCode)!,
                productName: `${line.productName} — ${line.skuName}`.slice(
                  0,
                  191
                ),
                skuCode: line.skuCode,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                total: line.total,
                personalization: line.personalization ?? undefined,
                services:
                  line.services.length > 0
                    ? (line.services as Prisma.InputJsonValue)
                    : undefined,
              })),
            },
          },
          select: { id: true },
        })

        await reserveStock(tx, {
          orderId: order.id,
          items: cart.lines.map((line) => ({
            skuId: skuIds.get(line.skuCode)!,
            quantity: line.quantity,
          })),
          userId: buyer.user.id,
        })

        let manualQuote: { respondBy: Date; businessDays: number } | null = null
        if (chosen) {
          await tx.shipment.create({
            data: {
              orderId: order.id,
              method: chosen.method,
              carrier: chosen.carrier,
              service: chosen.service,
              price: chosen.price,
              deliveryDays: chosen.deliveryDays,
              quoteData: {
                source: "checkout",
                quotedAt: now.toISOString(),
                strategy: quote.status === "quoted" ? quote.strategy : null,
              },
            },
          })
        } else {
          const businessDays = await loadManualQuoteResponseDays(tx)
          const respondBy = addBusinessDays(now, businessDays)
          const quoteData: ManualQuoteData = {
            reason: manualReason ?? "no_option",
            requestedAt: now.toISOString(),
            respondBy: respondBy.toISOString(),
          }
          await tx.shipment.create({
            data: {
              orderId: order.id,
              method: "MANUAL_QUOTE",
              price: "0.00",
              quoteData,
            },
          })
          manualQuote = { respondBy, businessDays }
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: null,
            toStatus: status,
            changedById: buyer.user.id,
            note: "Pedido criado no checkout.",
            createdAt: now,
          },
        })
        await enqueueOrderStatusEmails(tx, { orderId: order.id, to: status })
        await tx.cartItem.deleteMany({ where: { cartId } })
        await writeAudit(tx, {
          userId: buyer.user.id,
          action: "order.create",
          entity: "order",
          entityId: order.id,
          after: {
            number,
            status,
            paymentMethod: data.paymentMethod,
            total,
            shippingTotal: shipping,
            method: chosen?.method ?? "MANUAL_QUOTE",
            requiresApproval,
            scheduledDeliveryAt: scheduledDeliveryAt?.toISOString() ?? null,
          },
        })
        return { orderId: order.id, number, status, total, manualQuote }
      })

    let result: Awaited<ReturnType<typeof run>> | undefined
    for (let attempt = 1; !result; attempt += 1) {
      try {
        result = await run()
      } catch (error) {
        if (attempt >= ORDER_NUMBER_ATTEMPTS || !isRetryableOrderError(error))
          throw error
      }
    }

    if (result.manualQuote && manualReason) {
      await notifyManualQuoteRequested({
        to: buyer.user.email,
        name: buyer.user.name,
        orderNumber: result.number,
        reason: manualReason,
        businessDays: result.manualQuote.businessDays,
        respondBy: result.manualQuote.respondBy,
      })
    }
    return {
      success: true,
      order: {
        orderId: result.orderId,
        number: result.number,
        status: result.status,
        total: result.total,
        nextUrl:
          result.status === "AWAITING_PAYMENT"
            ? `/conta/pedidos/${result.orderId}/pagamento`
            : "/conta/pedidos",
      },
    }
  } catch (error) {
    return toActionError(error, { action: "placeOrder" })
  }
}
