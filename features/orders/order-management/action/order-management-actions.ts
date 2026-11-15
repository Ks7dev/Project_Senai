"use server"

import { revalidateTag } from "next/cache"
import { PRODUCTS_CACHE_TAG } from "@/features/shared/lib/catalog/product-cache"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  canCancelOrderItem,
  isPersonalized,
} from "@/features/shared/lib/orders/cancellation"
import { transitionOrder } from "@/features/shared/lib/orders/order-lifecycle"
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS,
} from "@/features/shared/lib/payments/payment-messages"
import {
  MANUAL_STATUS_PERMISSION,
  manualNextStatuses,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"
import {
  CANCELLATION_REASONS,
  orderFiltersSchema,
  updateOrderStatusSchema,
  type OrderFiltersInput,
  type UpdateOrderStatusInput,
} from "@/features/orders/order-management/schema/order-management-schema"

/** One entry of the order status history. */
export type OrderHistoryEntry = {
  /** Entry id. */
  id: string
  /** Status before, or null for the creation. */
  from: OrderStatusKey | null
  /** Status after. */
  to: OrderStatusKey
  /** When it changed, ISO. */
  at: string
  /** Who changed it, or "Sistema". */
  by: string
  /** Note. */
  note: string | null
}

/** An order in the back office list. */
export type AdminOrderRow = {
  /** Order id. */
  id: string
  /** Readable number. */
  number: string
  /** Customer name. */
  customer: string
  /** Company, for corporate orders. */
  company: string | null
  /** Current status. */
  status: OrderStatusKey
  /** Order total. */
  total: string
  /** Order date, ISO. */
  createdAt: string
  /** Delivery and installation date scheduled at checkout (RN05), ISO. */
  scheduledDeliveryAt: string | null
  /** Tracking code of the shipment (RF15), if any. */
  trackingCode: string | null
  /** Latest payment with the Mercado Pago payment_id (RF32), if any. */
  payment: {
    /** Payment method label. */
    method: string
    /** Payment status label. */
    status: string
    /** Mercado Pago payment id, for the financial reconciliation. */
    paymentId: string | null
  } | null
  /** Statuses this user may set by hand. */
  nextStatuses: OrderStatusKey[]
  /** Status history, oldest first. */
  history: OrderHistoryEntry[]
}

/**
 * Back office order list with the status history and the next statuses
 * the user may set (RF54).
 *
 * @param input - Status filter and search by number or customer.
 * @returns `{ success: true, orders }` or `{ success: false, error }`.
 */
export async function listAdminOrders(
  input: OrderFiltersInput = {}
): Promise<ActionResult<{ orders: AdminOrderRow[] }>> {
  try {
    const parsed = orderFiltersSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Filtro inválido.", "invalid")
    const { permissions } = await requirePermission("order:read")
    const { status, search } = parsed.data

    const rows = await prisma.order.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search
          ? {
              OR: [
                { number: { contains: search } },
                { user: { name: { contains: search } } },
                { organization: { name: { contains: search } } },
                // Financial reconciliation by the Mercado Pago id (RF32)
                { payments: { some: { paymentId: search } } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        createdAt: true,
        scheduledDeliveryAt: true,
        shipment: { select: { trackingCode: true } },
        user: { select: { name: true } },
        organization: { select: { name: true } },
        payments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { method: true, status: true, paymentId: true },
        },
        statusHistory: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fromStatus: true,
            toStatus: true,
            createdAt: true,
            note: true,
            changedBy: { select: { name: true } },
          },
        },
      },
    })
    return {
      success: true,
      orders: rows.map((row) => ({
        id: row.id,
        number: row.number,
        customer: row.user.name,
        company: row.organization?.name ?? null,
        status: row.status,
        total: row.total.toFixed(2),
        createdAt: row.createdAt.toISOString(),
        scheduledDeliveryAt: row.scheduledDeliveryAt?.toISOString() ?? null,
        trackingCode: row.shipment?.trackingCode ?? null,
        payment: row.payments[0]
          ? {
              method:
                PAYMENT_METHOD_LABEL[row.payments[0].method] ??
                row.payments[0].method,
              status:
                PAYMENT_STATUS[row.payments[0].status]?.label ??
                row.payments[0].status,
              paymentId: row.payments[0].paymentId,
            }
          : null,
        nextStatuses: manualNextStatuses(row.status, permissions),
        history: row.statusHistory.map((entry) => ({
          id: entry.id,
          from: entry.fromStatus,
          to: entry.toStatus,
          at: entry.createdAt.toISOString(),
          by: entry.changedBy?.name ?? "Sistema",
          note: entry.note,
        })),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listAdminOrders" })
  }
}

/**
 * Changes the status of an order by hand in the back office (RF54).
 * Only operational statuses can be set here, each with its own
 * permission; payment, approval and refund come from their own flows.
 * The life cycle refuses invalid transitions, the history records the
 * date and the responsible user and the audit log keeps before/after
 * (RNF12). A cancellation needs a reason and follows RN24 for
 * personalized items. When the order ships, the tracking code is saved
 * on the shipment before the status e-mail is queued, so the customer
 * sees it in the e-mail and in the order tracking (RF15).
 *
 * @param input - Order, new status, note, cancellation reason and
 *   tracking code.
 * @returns `{ success: true, status }` or `{ success: false, error }`.
 */
export async function updateOrderStatus(
  input: UpdateOrderStatusInput
): Promise<ActionResult<{ status: OrderStatusKey }>> {
  try {
    const parsed = updateOrderStatusSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a mudança de status.",
        "invalid"
      )
    }
    const data = parsed.data
    const permission = MANUAL_STATUS_PERMISSION[data.to]
    if (!permission) {
      throw new AppError(
        "Este status é definido automaticamente pelo sistema.",
        "system_status"
      )
    }
    const { user } = await requirePermission(permission)

    const transition = await prisma.$transaction(async (tx) => {
      if (data.to === "CANCELED" && data.cancellationReason) {
        const order = await tx.order.findUnique({
          where: { id: data.orderId },
          select: {
            status: true,
            user: { select: { personType: true } },
            items: { select: { personalization: true } },
          },
        })
        if (!order) throw new AppError("Pedido não encontrado.", "not_found")
        for (const item of order.items) {
          const check = canCancelOrderItem(
            {
              status: order.status,
              personalized: isPersonalized(item.personalization),
              personType: order.user.personType,
            },
            data.cancellationReason
          )
          if (!check.allowed) throw new AppError(check.message, "rn24")
        }
      }

      const note =
        data.to === "CANCELED" && data.cancellationReason
          ? [CANCELLATION_REASONS[data.cancellationReason], data.note]
              .filter(Boolean)
              .join(": ")
          : data.note || null
      const trackingCode =
        data.to === "SHIPPED" && data.trackingCode
          ? data.trackingCode.toUpperCase()
          : null
      if (trackingCode) {
        await tx.shipment.updateMany({
          where: { orderId: data.orderId },
          data: { trackingCode },
        })
      }
      const done = await transitionOrder(tx, {
        orderId: data.orderId,
        to: data.to,
        changedById: user.id,
        note,
      })
      await writeAudit(tx, {
        userId: user.id,
        action: "order.status.update",
        entity: "order",
        entityId: data.orderId,
        before: { status: done.from },
        after: { status: done.to, note, trackingCode },
      })
      return done
    })

    if (transition.to === "CANCELED") revalidateTag(PRODUCTS_CACHE_TAG, "max")
    return { success: true, status: transition.to }
  } catch (error) {
    return toActionError(error, { action: "updateOrderStatus" })
  }
}
