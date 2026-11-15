import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"

/** Statuses in which production (or what follows it) has started. */
export const PRODUCTION_STARTED_STATUSES: readonly OrderStatusKey[] = [
  "IN_PRODUCTION",
  "SEPARATING",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
]

/**
 * Why an item is being canceled: a customer request, a manufacturing
 * defect or the PF withdrawal right of RN22 (checked by the caller,
 * which knows the delivery date).
 */
export type CancellationReason = "customer_request" | "defect" | "withdrawal"

/** Message shown when a personalized item can no longer be canceled. */
export const PERSONALIZED_NOT_CANCELABLE_MESSAGE =
  "Itens personalizados não podem ser cancelados depois que a produção começa, salvo defeito de fabricação ou direito de arrependimento."

/** Notice shown in the cart before the customer personalizes an item. */
export const PERSONALIZATION_CANCELLATION_NOTICE =
  "Itens personalizados não podem ser cancelados depois que a produção começa, salvo defeito de fabricação ou direito de arrependimento (CDC)."

/**
 * Whether an order item can be canceled (RN24): an item with
 * personalization (RF51) cannot be canceled once production started,
 * except for a defect or, for PF customers only, the withdrawal right
 * (RN22). Items without personalization follow the general order
 * rules (#65).
 *
 * @param item - Order status, customer type and whether the item is
 * personalized.
 * @param reason - Why it is being canceled.
 * @returns `{ allowed: true }` or `{ allowed: false, message }`.
 */
export function canCancelOrderItem(
  item: {
    status: OrderStatusKey
    personalized: boolean
    personType: "PF" | "PJ"
  },
  reason: CancellationReason
): { allowed: true } | { allowed: false; message: string } {
  if (!item.personalized) return { allowed: true }
  if (!PRODUCTION_STARTED_STATUSES.includes(item.status)) {
    return { allowed: true }
  }
  if (reason === "defect") return { allowed: true }
  if (reason === "withdrawal" && item.personType === "PF") {
    return { allowed: true }
  }
  return { allowed: false, message: PERSONALIZED_NOT_CANCELABLE_MESSAGE }
}

/**
 * Whether a stored order item personalization counts as personalized.
 *
 * @param personalization - JSON stored in the order item.
 * @returns True when the item was personalized.
 */
export function isPersonalized(personalization: unknown): boolean {
  return (
    typeof personalization === "object" &&
    personalization !== null &&
    !Array.isArray(personalization) &&
    Object.keys(personalization).length > 0
  )
}
