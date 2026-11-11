import type { Permission } from "@/features/shared/lib/auth/permissions"

/** Order statuses of the order life cycle (RF54). */
export type OrderStatusKey =
  | "AWAITING_APPROVAL"
  | "AWAITING_SHIPPING_QUOTE"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "IN_PRODUCTION"
  | "SEPARATING"
  | "INVOICED"
  | "SHIPPED"
  | "DELIVERED"
  | "INSTALLED"
  | "CANCELED"
  | "REFUNDED"

/** Customer-facing label and badge tone of each status (RF15, RF54). */
export const ORDER_STATUS: Record<
  OrderStatusKey,
  { label: string; tone: "neutral" | "progress" | "done" | "problem" }
> = {
  AWAITING_APPROVAL: { label: "Aguardando aprovação", tone: "neutral" },
  AWAITING_SHIPPING_QUOTE: {
    label: "Aguardando cotação de frete",
    tone: "neutral",
  },
  AWAITING_PAYMENT: { label: "Aguardando pagamento", tone: "neutral" },
  PAID: { label: "Pagamento confirmado", tone: "progress" },
  IN_PRODUCTION: { label: "Em produção", tone: "progress" },
  SEPARATING: { label: "Em separação", tone: "progress" },
  INVOICED: { label: "Faturado", tone: "progress" },
  SHIPPED: { label: "Em transporte", tone: "progress" },
  DELIVERED: { label: "Entregue", tone: "done" },
  INSTALLED: { label: "Instalado", tone: "done" },
  CANCELED: { label: "Cancelado", tone: "problem" },
  REFUNDED: { label: "Estornado", tone: "problem" },
}

/**
 * Allowed transitions of the order life cycle (RF54). Anything not
 * listed is refused. Paths:
 * - checkout: awaiting shipping quote → awaiting approval (RN01) →
 *   awaiting payment → paid; an invoiced order goes from approval
 *   straight to paid/approved (RN13, RN17);
 * - fulfillment: paid → in production (personalized or made to order)
 *   → in separation → invoiced (NF-e) → in transport → delivered →
 *   installed (when there is assembly);
 * - exits: canceled before the NF-e, refunded after a payment.
 */
export const ORDER_TRANSITIONS: Record<
  OrderStatusKey,
  readonly OrderStatusKey[]
> = {
  AWAITING_SHIPPING_QUOTE: [
    "AWAITING_APPROVAL",
    "AWAITING_PAYMENT",
    "CANCELED",
  ],
  AWAITING_APPROVAL: [
    "AWAITING_SHIPPING_QUOTE",
    "AWAITING_PAYMENT",
    "PAID",
    "CANCELED",
  ],
  AWAITING_PAYMENT: ["AWAITING_SHIPPING_QUOTE", "PAID", "CANCELED"],
  PAID: ["IN_PRODUCTION", "SEPARATING", "CANCELED", "REFUNDED"],
  IN_PRODUCTION: ["SEPARATING", "CANCELED", "REFUNDED"],
  SEPARATING: ["INVOICED", "CANCELED", "REFUNDED"],
  INVOICED: ["SHIPPED", "REFUNDED"],
  SHIPPED: ["DELIVERED", "REFUNDED"],
  DELIVERED: ["INSTALLED", "REFUNDED"],
  INSTALLED: ["REFUNDED"],
  CANCELED: ["REFUNDED"],
  REFUNDED: [],
}

/**
 * Whether the order may go from one status to another (RF54).
 *
 * @param from - Current status.
 * @param to - Wanted status.
 * @returns True when the transition is allowed.
 */
export function canTransition(
  from: OrderStatusKey,
  to: OrderStatusKey
): boolean {
  return ORDER_TRANSITIONS[from].includes(to)
}

/**
 * Statuses the back office may set by hand and the permission each one
 * needs (RF55). The others are set by the system only: payment
 * confirmation and refund (Mercado Pago, RN13), approval (RN01) and
 * the shipping quote (RN20).
 */
export const MANUAL_STATUS_PERMISSION: Partial<
  Record<OrderStatusKey, Permission>
> = {
  IN_PRODUCTION: "order:status:update",
  SEPARATING: "order:status:update",
  INVOICED: "invoice:manage",
  SHIPPED: "shipment:manage",
  DELIVERED: "shipment:manage",
  INSTALLED: "shipment:manage",
  CANCELED: "order:cancel",
}

/**
 * Next statuses the back office user may choose for an order: allowed
 * by the life cycle, settable by hand and covered by the user's
 * permissions.
 *
 * @param from - Current status.
 * @param granted - Permissions of the user.
 * @returns The statuses, in life cycle order.
 */
export function manualNextStatuses(
  from: OrderStatusKey,
  granted: ReadonlySet<string>
): OrderStatusKey[] {
  return ORDER_TRANSITIONS[from].filter((to) => {
    const permission = MANUAL_STATUS_PERMISSION[to]
    return permission !== undefined && granted.has(permission)
  })
}

/**
 * Statuses in which the customer may change the delivery address with
 * a new shipping quote (RN15, #45): before any payment, while the order
 * is still in the checkout. After that the change goes through the
 * customer service, which handles the price difference.
 */
export const ADDRESS_CHANGE_STATUSES: readonly OrderStatusKey[] = [
  "AWAITING_SHIPPING_QUOTE",
  "AWAITING_APPROVAL",
  "AWAITING_PAYMENT",
]

/**
 * Whether the customer may change the delivery address of the order.
 *
 * @param status - Current status.
 * @returns True before the payment (RN15).
 */
export function canChangeAddress(status: OrderStatusKey): boolean {
  return ADDRESS_CHANGE_STATUSES.includes(status)
}

/** Quote statuses (RF06). */
export const QUOTE_STATUS: Record<string, string> = {
  REQUESTED: "Solicitada",
  IN_REVIEW: "Em análise",
  ANSWERED: "Respondida",
  ACCEPTED: "Aceita",
  REJECTED: "Recusada",
  EXPIRED: "Vencida",
  CONVERTED: "Convertida em pedido",
}
