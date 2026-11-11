/** Order statuses of the order life cycle (RF54). */
export type OrderStatusKey =
  | "AWAITING_APPROVAL"
  | "AWAITING_SHIPPING_QUOTE"
  | "AWAITING_PAYMENT"
  | "PAID"
  | "IN_PRODUCTION"
  | "SEPARATING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELED"
  | "REFUNDED"

/** Customer-facing label and badge tone of each status (RF15). */
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
  SHIPPED: { label: "Enviado", tone: "progress" },
  DELIVERED: { label: "Entregue", tone: "done" },
  CANCELED: { label: "Cancelado", tone: "problem" },
  REFUNDED: { label: "Estornado", tone: "problem" },
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
