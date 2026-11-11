"use server"

import type { Prisma } from "@/generated/prisma/client"
import {
  orderTrackingSchema,
  type OrderTrackingInput,
} from "@/features/orders/order-tracking/schema/order-tracking-schema"
import { addressLine } from "@/features/shared/lib/addresses/address-snapshot"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { isPersonalized } from "@/features/shared/lib/orders/cancellation"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"
import {
  buildOrderTimeline,
  type TimelineStep,
} from "@/features/shared/lib/orders/order-timeline"
import { PAYMENT_METHOD_LABEL } from "@/features/shared/lib/payments/payment-messages"

/** Corporate roles that see every order of the company (#37, RF10). */
const COMPANY_ORDER_ROLES = ["approver", "finance", "admin"] as const

/** Message when the order does not exist or belongs to someone else. */
const NOT_FOUND_MESSAGE = "Pedido não encontrado."

/** Shipping methods sent by the Correios. */
const CORREIOS_METHODS = ["CORREIOS_PAC", "CORREIOS_SEDEX"]

/** Public tracking page of the Correios. */
const CORREIOS_TRACKING_URL =
  "https://rastreamento.correios.com.br/app/index.php"

/** Delivery of the order as the customer sees it (RF15). */
export type TrackingShipment = {
  /** Who delivers, e.g. "Correios". */
  carrier: string | null
  /** Service, e.g. "PAC". */
  service: string | null
  /** Tracking code, once the order ships. */
  trackingCode: string | null
  /** Where the customer tracks the code, when the carrier has a page. */
  trackingUrl: string | null
  /** Business days to deliver, when known. */
  deliveryDays: number | null
  /** When it shipped, ISO string. */
  shippedAt: string | null
  /** When it was delivered, ISO string. */
  deliveredAt: string | null
  /** Whether the shipping still waits for the sales team quote. */
  manualQuote: boolean
}

/** What the order tracking page shows (RF15). */
export type OrderTracking = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Current status. */
  status: OrderStatusKey
  /** Order date, ISO string. */
  createdAt: string
  /** Order total, decimal string. */
  total: string
  /** Payment method label. */
  paymentMethod: string
  /** Delivery address, one line. */
  address: string
  /** Delivery and installation date (RN05), ISO string. */
  scheduledDeliveryAt: string | null
  /** Who placed the order. */
  buyer: string
  /** Whether the user placed the order (and so sees its payment). */
  ownOrder: boolean
  /** Lines of the order. */
  items: Array<{ id: string; name: string; quantity: number }>
  /** Every status of the order path, with dates (RF15, RF54). */
  timeline: TimelineStep[]
  /** Delivery, or null before the shipping is chosen. */
  shipment: TrackingShipment | null
}

/**
 * Orders the logged-in user may track: their own, and every order of
 * the company for approvers, finance and administrators (RF10). The
 * user comes from the session, never from the request.
 *
 * @param userId - Session user id.
 * @returns The Prisma where clause.
 */
async function trackingScope(userId: string): Promise<Prisma.OrderWhereInput> {
  const corporate = await getCorporateContext()
  const seesCompany =
    corporate !== null &&
    corporate.roles.some((role) =>
      (COMPANY_ORDER_ROLES as readonly string[]).includes(role)
    )
  return seesCompany
    ? { OR: [{ userId }, { organizationId: corporate.organizationId }] }
    : { userId }
}

/**
 * Loads the tracking of an order for the customer area (RF15): the
 * timeline with every status of its path and the date each one was
 * reached, the delivery and installation date, and the tracking code
 * when the order has one.
 *
 * @param input - Order id.
 * @returns `{ success: true, tracking }` or `{ success: false, error }`.
 */
export async function getOrderTracking(
  input: OrderTrackingInput
): Promise<ActionResult<{ tracking: OrderTracking }>> {
  try {
    const parsed = orderTrackingSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Pedido inválido.", "invalid")
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")

    const order = await prisma.order.findFirst({
      where: {
        id: parsed.data.orderId,
        ...(await trackingScope(user.id)),
      },
      select: {
        id: true,
        number: true,
        status: true,
        createdAt: true,
        total: true,
        paymentMethod: true,
        shippingAddress: true,
        scheduledDeliveryAt: true,
        requiresApproval: true,
        userId: true,
        user: { select: { name: true } },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            personalization: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          select: { toStatus: true, createdAt: true },
        },
        shipment: {
          select: {
            method: true,
            carrier: true,
            service: true,
            trackingCode: true,
            deliveryDays: true,
            shippedAt: true,
            deliveredAt: true,
          },
        },
      },
    })
    if (!order) throw new AppError(NOT_FOUND_MESSAGE, "not_found")

    const shipment = order.shipment
    const trackingCode = shipment?.trackingCode?.trim() || null
    return {
      success: true,
      tracking: {
        orderId: order.id,
        number: order.number,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        total: order.total.toFixed(2),
        paymentMethod:
          PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod,
        address: addressLine(order.shippingAddress),
        scheduledDeliveryAt: order.scheduledDeliveryAt?.toISOString() ?? null,
        buyer: order.user.name,
        ownOrder: order.userId === user.id,
        items: order.items.map((item) => ({
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
        })),
        timeline: buildOrderTimeline({
          status: order.status,
          history: order.statusHistory.map((entry) => ({
            to: entry.toStatus,
            at: entry.createdAt.toISOString(),
          })),
          requiresApproval: order.requiresApproval,
          invoiced: order.paymentMethod === "INVOICED",
          needsProduction: order.items.some((item) =>
            isPersonalized(item.personalization)
          ),
          hasInstallation: order.scheduledDeliveryAt !== null,
        }),
        shipment: shipment
          ? {
              carrier: shipment.carrier,
              service: shipment.service,
              trackingCode,
              trackingUrl:
                trackingCode && CORREIOS_METHODS.includes(shipment.method)
                  ? CORREIOS_TRACKING_URL
                  : null,
              deliveryDays: shipment.deliveryDays,
              shippedAt: shipment.shippedAt?.toISOString() ?? null,
              deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
              manualQuote: shipment.method === "MANUAL_QUOTE",
            }
          : null,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getOrderTracking" })
  }
}
