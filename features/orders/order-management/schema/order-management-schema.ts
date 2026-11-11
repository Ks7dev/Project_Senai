import { z } from "zod"
import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"

/** Every order status, for validation. */
export const ORDER_STATUS_KEYS = [
  "AWAITING_APPROVAL",
  "AWAITING_SHIPPING_QUOTE",
  "AWAITING_PAYMENT",
  "PAID",
  "IN_PRODUCTION",
  "SEPARATING",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
  "CANCELED",
  "REFUNDED",
] as const satisfies readonly OrderStatusKey[]

/** Why an order is canceled by the back office (RN24, RN22). */
export const CANCELLATION_REASONS = {
  customer_request: "Pedido do cliente",
  defect: "Defeito de fabricação",
  withdrawal: "Direito de arrependimento",
} as const

/** A cancellation reason key. */
export type CancellationReasonKey = keyof typeof CANCELLATION_REASONS

/** Filters of the back office order list. */
export const orderFiltersSchema = z.object({
  status: z.enum(ORDER_STATUS_KEYS).optional(),
  search: z.string().trim().max(60).optional().default(""),
})

/** Order list filters before validation. */
export type OrderFiltersInput = z.input<typeof orderFiltersSchema>

/**
 * Status change made by hand in the back office (RF54): the new status,
 * an optional note, for a cancellation the reason and, when the order
 * ships, the tracking code shown to the customer (RF15).
 */
export const updateOrderStatusSchema = z
  .object({
    orderId: z.uuid("Pedido inválido."),
    to: z.enum(ORDER_STATUS_KEYS, "Escolha o novo status."),
    note: z
      .string()
      .trim()
      .max(255, "Use no máximo 255 caracteres.")
      .optional()
      .default(""),
    trackingCode: z
      .string()
      .trim()
      .max(64, "Use no máximo 64 caracteres.")
      .regex(
        /^[A-Za-z0-9-]*$/,
        "Use apenas letras, números e hífen no código de rastreio."
      )
      .optional()
      .default(""),
    cancellationReason: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .enum(
          Object.keys(CANCELLATION_REASONS) as [
            CancellationReasonKey,
            ...CancellationReasonKey[],
          ],
          "Motivo de cancelamento inválido."
        )
        .optional()
    ),
  })
  .refine((data) => data.to !== "CANCELED" || data.cancellationReason, {
    message: "Informe o motivo do cancelamento.",
    path: ["cancellationReason"],
  })

/** Status change values before validation. */
export type UpdateOrderStatusInput = z.input<typeof updateOrderStatusSchema>

/** Status change values after validation. */
export type UpdateOrderStatusData = z.output<typeof updateOrderStatusSchema>
