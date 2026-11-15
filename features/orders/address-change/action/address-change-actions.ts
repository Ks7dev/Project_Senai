"use server"

import { z } from "zod"
import type { Prisma } from "@/generated/prisma/client"
import {
  addressChangeQuoteSchema,
  confirmAddressChangeSchema,
  type AddressChangeQuoteInput,
  type ConfirmAddressChangeInput,
} from "@/features/orders/address-change/schema/address-change-schema"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import {
  canChangeAddress,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"
import {
  loadManualQuoteResponseDays,
  notifyManualQuoteRequested,
  sendOrderToManualShippingQuote,
} from "@/features/shared/lib/shipping/manual-quote"
import { quoteShippingForItems } from "@/features/shared/lib/shipping/shipping-service"
import {
  fromCents,
  toCents,
  type ManualQuoteReason,
  type ShippingMethodKey,
  type ShippingOption,
  type ShippingQuote,
} from "@/features/shared/lib/shipping/strategies"

/** Shipping of the order as it is now. */
export type CurrentShipping = {
  /** Method on the shipment, or null when there is none yet. */
  method: ShippingMethodKey | null
  /** Who delivers. */
  carrier: string | null
  /** Service name. */
  service: string | null
  /** Delivery time in business days, or null. */
  deliveryDays: number | null
  /** Shipping price on the order, decimal string. */
  price: string
}

/** A delivery address the customer may choose. */
export type AddressChoice = {
  /** Address id. */
  id: string
  /** Nickname, e.g. "Matriz". */
  label: string
  /** One-line address. */
  line: string
}

/** What the address change page shows (RN15, #45). */
export type AddressChangeContext = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Current status. */
  status: OrderStatusKey
  /** Whether the address may still be changed by the customer. */
  changeable: boolean
  /** Current delivery address, one line. */
  currentAddress: string
  /** Current shipping. */
  shipping: CurrentShipping
  /** Current order total. */
  total: string
  /** Saved addresses of the account. */
  addresses: AddressChoice[]
}

/** A new shipping option with what it changes in the order. */
export type RequotedOption = ShippingOption & {
  /** New shipping minus the current one (negative when cheaper). */
  difference: string
  /** Order total with this option. */
  newTotal: string
}

/** Result of the re-quote, for the customer to confirm. */
export type AddressChangeQuote = {
  /** Shipping price on the order now. */
  currentShipping: string
  /** Order total now. */
  currentTotal: string
  /** New address, one line. */
  newAddress: string
} & (
  | { status: "quoted"; options: RequotedOption[] }
  | {
      status: "manual_quote"
      /** Why the sales team must quote the new address. */
      reason: ManualQuoteReason
      /** Return time of the sales team, in business days. */
      responseBusinessDays: number
      /** Order total without shipping until the sales team quotes. */
      newTotal: string
      /** Shipping removed from the total until the new quote. */
      difference: string
    }
)

/** Message for orders whose address the customer may not change. */
const NOT_CHANGEABLE_MESSAGE =
  "O endereço deste pedido não pode mais ser alterado pelo site. Fale com o atendimento."

/** Message for orders with a payment in progress. */
const PAYMENT_IN_PROGRESS_MESSAGE =
  "Este pedido já tem um pagamento em andamento. Fale com o atendimento para alterar o endereço."

/** Message when the price moved between the quote and the confirmation. */
const QUOTE_CHANGED_MESSAGE =
  "O valor do frete mudou desde a cotação. Confira a nova cotação antes de confirmar."

/** Address snapshot stored on the order (no later edit changes it). */
type AddressSnapshot = {
  addressId: string
  label: string
  recipient: string
  cep: string
  street: string
  number: string
  complement: string | null
  district: string
  city: string
  state: string
}

const snapshotSchema = z
  .object({
    cep: z.string().optional(),
    street: z.string().optional(),
    number: z.string().optional(),
    complement: z.string().nullable().optional(),
    district: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  })
  .passthrough()

/**
 * Formats a CEP as 00000-000.
 *
 * @param cep - 8 digits.
 * @returns The formatted CEP.
 */
function formatCep(cep: string): string {
  return cep.replace(/^(\d{5})(\d{3})$/, "$1-$2")
}

/**
 * One-line description of an address snapshot or a saved address.
 *
 * @param value - Address fields.
 * @returns "Rua, 10 – Sala 2 · Bairro · Cidade/UF · CEP 00000-000".
 */
function describeAddress(value: unknown): string {
  const parsed = snapshotSchema.safeParse(value)
  if (!parsed.success) return "—"
  const { cep, street, number, complement, district, city, state } = parsed.data
  const parts = [
    street
      ? `${street}${number ? `, ${number}` : ""}${complement ? ` – ${complement}` : ""}`
      : null,
    district || null,
    city ? `${city}${state ? `/${state}` : ""}` : null,
    cep ? `CEP ${formatCep(cep)}` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(" · ") : "—"
}

/**
 * Logged-in user, from the session (never from the request).
 *
 * @returns The user id.
 * @throws AppError("unauthenticated").
 */
async function sessionUserId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  return user.id
}

const orderSelect = {
  id: true,
  number: true,
  userId: true,
  organizationId: true,
  status: true,
  subtotal: true,
  discount: true,
  servicesTotal: true,
  shippingTotal: true,
  total: true,
  shippingAddress: true,
  requiresApproval: true,
  approvedAt: true,
  user: { select: { name: true, email: true } },
  items: { select: { skuCode: true, quantity: true } },
  shipment: {
    select: {
      method: true,
      carrier: true,
      service: true,
      price: true,
      deliveryDays: true,
      quoteData: true,
    },
  },
  payments: {
    where: { status: { in: ["PENDING", "APPROVED"] } },
    select: { id: true },
  },
} satisfies Prisma.OrderSelect

type ChangeOrder = Prisma.OrderGetPayload<{ select: typeof orderSelect }>

/**
 * Loads an order of the logged-in customer. Only the buyer who placed
 * the order changes its address; anyone else gets "not found", so the
 * order id reveals nothing.
 *
 * @param client - Prisma client or transaction.
 * @param orderId - Order id.
 * @param userId - Session user id.
 * @returns The order.
 * @throws AppError("not_found").
 */
async function loadOwnOrder(
  client: Pick<Prisma.TransactionClient, "order">,
  orderId: string,
  userId: string
): Promise<ChangeOrder> {
  const order = await client.order.findFirst({
    where: { id: orderId, userId },
    select: orderSelect,
  })
  if (!order) throw new AppError("Pedido não encontrado.", "not_found")
  return order
}

/**
 * Refuses orders whose address the customer may no longer change:
 * after the payment, or with a payment in progress (RN15).
 *
 * @param order - The order.
 * @throws AppError("invalid_status") or AppError("payment_in_progress").
 */
function assertChangeable(order: ChangeOrder): void {
  if (!canChangeAddress(order.status)) {
    throw new AppError(NOT_CHANGEABLE_MESSAGE, "invalid_status")
  }
  if (order.payments.length > 0) {
    throw new AppError(PAYMENT_IN_PROGRESS_MESSAGE, "payment_in_progress")
  }
}

/**
 * Loads a saved address the customer may deliver this order to: of the
 * company for corporate orders (RF26), of the customer otherwise.
 *
 * @param order - The order.
 * @param addressId - Address id from the request.
 * @param userId - Session user id.
 * @returns The address snapshot.
 * @throws AppError("address_not_found").
 */
async function loadAddress(
  order: Pick<ChangeOrder, "organizationId">,
  addressId: string,
  userId: string
): Promise<AddressSnapshot> {
  const address = await prisma.address.findFirst({
    where: {
      id: addressId,
      deletedAt: null,
      ...(order.organizationId
        ? { organizationId: order.organizationId }
        : { userId }),
    },
  })
  if (!address) {
    throw new AppError(
      "Escolha um dos endereços cadastrados na sua conta.",
      "address_not_found"
    )
  }
  return {
    addressId: address.id,
    label: address.label,
    recipient: address.recipient,
    cep: address.cep,
    street: address.street,
    number: address.number,
    complement: address.complement,
    district: address.district,
    city: address.city,
    state: address.state,
  }
}

/**
 * Order total without the shipping: products minus discount plus the
 * additional services.
 *
 * @param order - The order.
 * @returns Cents.
 */
function totalWithoutShippingCents(
  order: Pick<ChangeOrder, "subtotal" | "discount" | "servicesTotal">
): number {
  return (
    toCents(order.subtotal.toString()) -
    toCents(order.discount.toString()) +
    toCents(order.servicesTotal.toString())
  )
}

/**
 * Re-quotes the shipping of the order lines to the new address, with
 * the same strategies as the checkout (RF25, RN20).
 *
 * @param order - The order.
 * @param address - New address.
 * @returns The new quote.
 */
async function requote(
  order: ChangeOrder,
  address: AddressSnapshot
): Promise<ShippingQuote> {
  return quoteShippingForItems({
    cep: address.cep,
    items: order.items.map((item) => ({
      skuCode: item.skuCode,
      quantity: item.quantity,
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
 * Loads what the address change page shows: the order, its current
 * address and shipping and the saved addresses of the account (RN15).
 *
 * @param input - Order id.
 * @returns `{ success: true, context }` or `{ success: false, error }`.
 */
export async function getAddressChange(input: {
  orderId: string
}): Promise<ActionResult<{ context: AddressChangeContext }>> {
  try {
    const parsed = addressChangeQuoteSchema
      .pick({ orderId: true })
      .safeParse(input)
    if (!parsed.success) throw new AppError("Pedido inválido.", "invalid")
    const userId = await sessionUserId()
    const order = await loadOwnOrder(prisma, parsed.data.orderId, userId)
    const addresses = await prisma.address.findMany({
      where: {
        deletedAt: null,
        ...(order.organizationId
          ? { organizationId: order.organizationId }
          : { userId }),
      },
      orderBy: [{ isDefault: "desc" }, { label: "asc" }],
    })
    return {
      success: true,
      context: {
        orderId: order.id,
        number: order.number,
        status: order.status,
        changeable:
          canChangeAddress(order.status) && order.payments.length === 0,
        currentAddress: describeAddress(order.shippingAddress),
        shipping: {
          method: order.shipment?.method ?? null,
          carrier: order.shipment?.carrier ?? null,
          service: order.shipment?.service ?? null,
          deliveryDays: order.shipment?.deliveryDays ?? null,
          price: order.shippingTotal.toFixed(2),
        },
        total: order.total.toFixed(2),
        addresses: addresses.map((address) => ({
          id: address.id,
          label: address.label,
          line: describeAddress(address),
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getAddressChange" })
  }
}

/**
 * Re-quotes shipping and delivery time for a new address of an order
 * (RN15, #45). Nothing changes on the order: the customer sees the
 * difference of each option and confirms with `confirmAddressChange`.
 *
 * @param input - Order and new address.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function quoteAddressChange(
  input: AddressChangeQuoteInput
): Promise<ActionResult<{ quote: AddressChangeQuote }>> {
  try {
    const parsed = addressChangeQuoteSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o endereço.",
        "invalid"
      )
    }
    const userId = await sessionUserId()
    await enforceActionRateLimit("shipping", { limit: 30, windowMs: 60_000 })
    const order = await loadOwnOrder(prisma, parsed.data.orderId, userId)
    assertChangeable(order)
    const address = await loadAddress(order, parsed.data.addressId, userId)
    const quote = await requote(order, address)

    const base = totalWithoutShippingCents(order)
    const current = toCents(order.shippingTotal.toString())
    const common = {
      currentShipping: fromCents(current),
      currentTotal: order.total.toFixed(2),
      newAddress: describeAddress(address),
    }
    if (quote.status === "manual_quote") {
      return {
        success: true,
        quote: {
          ...common,
          status: "manual_quote",
          reason: quote.reason,
          responseBusinessDays:
            quote.responseBusinessDays ?? (await loadManualQuoteResponseDays()),
          newTotal: fromCents(base),
          difference: fromCents(-current),
        },
      }
    }
    return {
      success: true,
      quote: {
        ...common,
        status: "quoted",
        options: quote.options.map((option) => ({
          ...option,
          difference: fromCents(toCents(option.price) - current),
          newTotal: fromCents(base + toCents(option.price)),
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "quoteAddressChange" })
  }
}

/**
 * Applies the address change the customer confirmed (RN15, #45). The
 * shipping is quoted again on the server and the change only goes on
 * when the chosen option still costs what the customer saw; otherwise
 * the customer reviews the new quote. In one transaction it stores the
 * new address snapshot, shipment, shipping and total, re-checks the
 * approval limit (RN01) and writes the audit log (RNF12). When the new
 * address needs a manual quote (RN16, RN20) the order waits for the
 * sales team.
 *
 * @param input - Order, new address, chosen option and seen price.
 * @returns `{ success: true, status, total }` or `{ success: false, error }`.
 */
export async function confirmAddressChange(
  input: ConfirmAddressChangeInput
): Promise<ActionResult<{ status: OrderStatusKey; total: string }>> {
  try {
    const parsed = confirmAddressChangeSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a alteração de endereço.",
        "invalid"
      )
    }
    const data = parsed.data
    const userId = await sessionUserId()
    await enforceActionRateLimit("shipping", { limit: 30, windowMs: 60_000 })
    const order = await loadOwnOrder(prisma, data.orderId, userId)
    assertChangeable(order)
    const address = await loadAddress(order, data.addressId, userId)
    // The APIs are called outside the transaction, so no row stays
    // locked while they answer
    const quote = await requote(order, address)

    let chosen: ShippingOption | null = null
    if (data.option) {
      chosen =
        quote.status === "quoted"
          ? (quote.options.find((option) => sameOption(option, data.option!)) ??
            null)
          : null
      if (!chosen || chosen.price !== data.expectedShippingPrice) {
        throw new AppError(QUOTE_CHANGED_MESSAGE, "quote_changed")
      }
    } else if (
      quote.status !== "manual_quote" ||
      data.expectedShippingPrice !== "0.00"
    ) {
      throw new AppError(QUOTE_CHANGED_MESSAGE, "quote_changed")
    }

    const now = new Date()
    const result = await prisma.$transaction(async (tx) => {
      // Lock the order row (justified raw query: Prisma has no row
      // lock) and read it again, so a payment or another change that
      // ran meanwhile wins
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${order.id} FOR UPDATE`
      const locked = await loadOwnOrder(tx, order.id, userId)
      assertChangeable(locked)

      const base = totalWithoutShippingCents(locked)
      const price = chosen ? chosen.price : "0.00"
      const total = fromCents(base + toCents(price))
      const previousTotal = locked.total.toFixed(2)
      let status: OrderStatusKey = locked.status
      let requiresApproval = locked.requiresApproval
      let manualQuote: { respondBy: Date; businessDays: number } | null = null

      if (chosen) {
        const approvalLimit = await getNumberSetting("order.approval_limit", tx)
        const aboveLimit =
          locked.organizationId !== null && Number(total) > approvalLimit
        if (locked.status === "AWAITING_PAYMENT") {
          // RN01: an approved (or unneeded) approval does not cover a
          // higher total above the limit; the order cannot go back to
          // approval by itself
          if (aboveLimit && toCents(total) > toCents(previousTotal)) {
            throw new AppError(
              "O novo total exige nova aprovação da empresa. Fale com o atendimento para alterar o endereço.",
              "approval_required"
            )
          }
        } else {
          requiresApproval = locked.requiresApproval || aboveLimit
        }
        if (locked.status === "AWAITING_SHIPPING_QUOTE") {
          status =
            requiresApproval && !locked.approvedAt
              ? "AWAITING_APPROVAL"
              : "AWAITING_PAYMENT"
          await transitionOrder(tx, {
            orderId: locked.id,
            to: status,
            changedById: userId,
            note: "Frete recotado pela alteração de endereço.",
            expectedFrom: ["AWAITING_SHIPPING_QUOTE"],
            unexpectedMessage: NOT_CHANGEABLE_MESSAGE,
            now,
          })
        }
        const shipment = {
          method: chosen.method,
          carrier: chosen.carrier,
          service: chosen.service,
          price: chosen.price,
          deliveryDays: chosen.deliveryDays,
          quoteData: {
            source: "address_change",
            requotedAt: now.toISOString(),
            confirmedById: userId,
            strategy: quote.status === "quoted" ? quote.strategy : null,
          },
        }
        await tx.shipment.upsert({
          where: { orderId: locked.id },
          create: { orderId: locked.id, ...shipment },
          update: shipment,
        })
      } else {
        const reason =
          quote.status === "manual_quote" ? quote.reason : "no_option"
        if (locked.status === "AWAITING_SHIPPING_QUOTE") {
          // Already in the sales queue: the deadline restarts for the
          // new address
          const businessDays = await loadManualQuoteResponseDays(tx)
          const respondBy = addBusinessDays(now, businessDays)
          const quoteData = {
            reason,
            requestedAt: now.toISOString(),
            respondBy: respondBy.toISOString(),
          }
          await tx.shipment.upsert({
            where: { orderId: locked.id },
            create: {
              orderId: locked.id,
              method: "MANUAL_QUOTE",
              price: "0.00",
              quoteData,
            },
            update: { quoteData },
          })
          manualQuote = { respondBy, businessDays }
        } else {
          manualQuote = await sendOrderToManualShippingQuote(tx, {
            orderId: locked.id,
            reason,
            changedById: userId,
            now,
          })
          status = "AWAITING_SHIPPING_QUOTE"
        }
      }

      await tx.order.update({
        where: { id: locked.id },
        data: {
          shippingAddress: address,
          shippingTotal: price,
          total,
          requiresApproval,
          // The delivery date is scheduled again for the new address
          scheduledDeliveryAt: null,
        },
      })
      await writeAudit(tx, {
        userId,
        action: "order.address_change",
        entity: "order",
        entityId: locked.id,
        before: {
          status: locked.status,
          address: locked.shippingAddress,
          method: locked.shipment?.method ?? null,
          shippingTotal: locked.shippingTotal,
          total: previousTotal,
        },
        after: {
          status,
          address,
          method: chosen?.method ?? "MANUAL_QUOTE",
          carrier: chosen?.carrier ?? null,
          service: chosen?.service ?? null,
          deliveryDays: chosen?.deliveryDays ?? null,
          shippingTotal: price,
          total,
        },
      })
      return { status, total, manualQuote }
    })

    if (result.manualQuote && quote.status === "manual_quote") {
      await notifyManualQuoteRequested({
        to: order.user.email,
        name: order.user.name,
        orderNumber: order.number,
        reason: quote.reason,
        businessDays: result.manualQuote.businessDays,
        respondBy: result.manualQuote.respondBy,
      })
    }
    return { success: true, status: result.status, total: result.total }
  } catch (error) {
    return toActionError(error, { action: "confirmAddressChange" })
  }
}
