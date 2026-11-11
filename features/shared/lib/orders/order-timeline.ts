import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"

/** Life cycle order of the statuses before an exit (RF54). */
const LIFECYCLE: readonly OrderStatusKey[] = [
  "AWAITING_SHIPPING_QUOTE",
  "AWAITING_APPROVAL",
  "AWAITING_PAYMENT",
  "PAID",
  "IN_PRODUCTION",
  "SEPARATING",
  "INVOICED",
  "SHIPPED",
  "DELIVERED",
  "INSTALLED",
]

/** Statuses that end the order outside the normal path. */
const EXITS: readonly OrderStatusKey[] = ["CANCELED", "REFUNDED"]

/** Statuses after which nothing is left to happen. */
const FINAL: readonly OrderStatusKey[] = ["DELIVERED", "INSTALLED"]

/** What each status means to the customer, in Portuguese (RF15). */
export const ORDER_STATUS_DESCRIPTION: Record<OrderStatusKey, string> = {
  AWAITING_SHIPPING_QUOTE:
    "Nossa equipe comercial está calculando o frete do seu endereço.",
  AWAITING_APPROVAL: "O pedido aguarda a aprovação de um aprovador da empresa.",
  AWAITING_PAYMENT: "Aguardando a confirmação do pagamento.",
  PAID: "O pagamento foi confirmado.",
  IN_PRODUCTION: "Os itens personalizados ou sob encomenda estão em produção.",
  SEPARATING: "Os itens estão sendo separados e embalados.",
  INVOICED: "A nota fiscal do pedido foi emitida.",
  SHIPPED: "O pedido saiu para entrega.",
  DELIVERED: "O pedido foi entregue.",
  INSTALLED: "Os móveis foram montados e instalados.",
  CANCELED: "O pedido foi cancelado.",
  REFUNDED: "O valor pago foi estornado.",
}

/** A status change of the order history. */
export type TimelineHistoryEntry = {
  /** Status reached. */
  to: OrderStatusKey
  /** When, ISO string. */
  at: string
}

/** Where a step stands. */
export type TimelineStepState = "done" | "current" | "pending" | "problem"

/** A step of the order timeline. */
export type TimelineStep = {
  /** Status of the step. */
  status: OrderStatusKey
  /** Customer-facing label. */
  label: string
  /** What the step means. */
  description: string
  /** Where the step stands. */
  state: TimelineStepState
  /** When the order last reached the step, ISO string; null if never. */
  at: string | null
}

/** What decides which steps the order goes through. */
export type TimelineInput = {
  /** Current status. */
  status: OrderStatusKey
  /** Status history, in any order. */
  history: TimelineHistoryEntry[]
  /** The order waits for the company approval (RN01). */
  requiresApproval: boolean
  /** The order is paid by invoice, so it skips the online payment (RN03). */
  invoiced: boolean
  /** A line is personalized or made to order. */
  needsProduction: boolean
  /** The order has a delivery and installation date (RN05). */
  hasInstallation: boolean
}

/**
 * Statuses the order is expected to go through, besides the ones it has
 * already reached.
 *
 * @param input - Order flags.
 * @returns The expected statuses.
 */
function expectedStatuses(input: TimelineInput): Set<OrderStatusKey> {
  const expected = new Set<OrderStatusKey>([
    "PAID",
    "SEPARATING",
    "INVOICED",
    "SHIPPED",
    "DELIVERED",
  ])
  if (!input.invoiced) expected.add("AWAITING_PAYMENT")
  if (input.requiresApproval) expected.add("AWAITING_APPROVAL")
  if (input.needsProduction) expected.add("IN_PRODUCTION")
  if (input.hasInstallation) expected.add("INSTALLED")
  return expected
}

/**
 * Builds the order timeline the customer sees (RF15, RF54): every status
 * of the order's path, in life cycle order, with the date it was reached,
 * the current one highlighted and the next ones still pending. A
 * canceled or refunded order shows only what happened, ending in the
 * exit.
 *
 * @param input - Current status, history and order flags.
 * @returns The steps, in order.
 */
export function buildOrderTimeline(input: TimelineInput): TimelineStep[] {
  const reachedAt = new Map<OrderStatusKey, string>()
  for (const entry of [...input.history].sort((a, b) =>
    a.at.localeCompare(b.at)
  )) {
    reachedAt.set(entry.to, entry.at)
  }
  const reached = new Set<OrderStatusKey>([...reachedAt.keys(), input.status])
  const step = (
    status: OrderStatusKey,
    state: TimelineStepState
  ): TimelineStep => ({
    status,
    label: ORDER_STATUS[status].label,
    description: ORDER_STATUS_DESCRIPTION[status],
    state,
    at: reachedAt.get(status) ?? null,
  })

  if (EXITS.includes(input.status)) {
    const path = LIFECYCLE.filter((status) => reached.has(status))
    const exits = EXITS.filter((status) => reached.has(status))
    return [
      ...path.map((status) => step(status, "done")),
      ...exits.map((status) =>
        step(status, status === input.status ? "problem" : "done")
      ),
    ]
  }

  const expected = expectedStatuses(input)
  const position = LIFECYCLE.indexOf(input.status)
  const statuses = LIFECYCLE.filter((status, index) =>
    index <= position ? reached.has(status) : expected.has(status)
  )
  const finished =
    FINAL.includes(input.status) && statuses.at(-1) === input.status
  return statuses.map((status) => {
    const index = LIFECYCLE.indexOf(status)
    if (index < position) return step(status, "done")
    if (index > position) return step(status, "pending")
    return step(status, finished ? "done" : "current")
  })
}
