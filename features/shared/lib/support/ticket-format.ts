import type { OrderStatusKey } from "@/features/shared/lib/orders/order-status"

/** Prefix of the readable ticket numbers. */
export const TICKET_NUMBER_PREFIX = "CHA"

/**
 * Order statuses in which the customer already has the product and may
 * open a warranty or technical assistance ticket (RF17).
 */
export const SUPPORT_ELIGIBLE_ORDER_STATUSES: readonly OrderStatusKey[] = [
  "DELIVERED",
  "INSTALLED",
]

/**
 * Legal warranty of durable goods, in days (CDC, art. 26, II). Law, not
 * a business setting: the contractual warranty of each product is added
 * to it (commercial policy, section 2.1).
 */
export const LEGAL_WARRANTY_DAYS = 90

/** Shortest subject of a ticket. */
export const TICKET_SUBJECT_MIN = 5

/** Longest subject of a ticket. */
export const TICKET_SUBJECT_MAX = 160

/** Shortest description of the problem. */
export const TICKET_DESCRIPTION_MIN = 20

/** Longest description or message. */
export const TICKET_MESSAGE_MAX = 4000

/** Shortest written outcome of the evaluation. */
export const TICKET_RESOLUTION_MIN = 10

/**
 * Builds a readable ticket number, e.g. "CHA-2026-000123" (RF17).
 *
 * @param year - Year of the opening (UTC).
 * @param sequence - Sequence inside the year.
 * @returns The number.
 */
export function formatTicketNumber(year: number, sequence: number): string {
  return `${TICKET_NUMBER_PREFIX}-${year}-${String(sequence).padStart(6, "0")}`
}

/**
 * Whether an order status lets the customer open a ticket (RF17).
 *
 * @param status - Order status.
 * @returns True once the product was delivered.
 */
export function canOpenTicketForOrder(status: OrderStatusKey): boolean {
  return SUPPORT_ELIGIBLE_ORDER_STATUSES.includes(status)
}

/**
 * Adds calendar months in UTC, keeping the day when the month has it
 * (31/01 + 1 month = 28/02 or 29/02).
 *
 * @param date - Start.
 * @param months - Months to add.
 * @returns The new date.
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}

/** Estimated warranty coverage of an item. */
export type WarrantyCoverage = {
  /** End of the legal plus contractual warranty; null before delivery. */
  until: Date | null
  /** Whether today is inside the coverage; null before delivery. */
  withinCoverage: boolean | null
}

/**
 * Estimated end of the warranty of an item: the legal warranty plus the
 * contractual months of the product, counted from the delivery
 * (commercial policy, section 2.1). It is only a reference for the
 * team: the technical evaluation decides, and a hidden defect counts
 * from its discovery, so the ticket is never blocked by it.
 *
 * @param input - Delivery date, contractual months and today.
 * @returns The coverage.
 */
export function warrantyCoverage(input: {
  deliveredAt: Date | null
  warrantyMonths: number
  now: Date
}): WarrantyCoverage {
  if (!input.deliveredAt) return { until: null, withinCoverage: null }
  const legalEnd = new Date(
    input.deliveredAt.getTime() + LEGAL_WARRANTY_DAYS * 24 * 60 * 60 * 1000
  )
  const until = addMonths(legalEnd, Math.max(0, input.warrantyMonths))
  return { until, withinCoverage: input.now.getTime() <= until.getTime() }
}

/**
 * Delivery date of an order: the shipment date, or the first time it
 * reached "delivered" in the history.
 *
 * @param input - Shipment delivery date and status history.
 * @returns The date, or null when it was never delivered.
 */
export function orderDeliveredAt(input: {
  shipmentDeliveredAt: Date | null | undefined
  history: ReadonlyArray<{ toStatus: string; createdAt: Date }>
}): Date | null {
  if (input.shipmentDeliveredAt) return input.shipmentDeliveredAt
  const delivered = input.history
    .filter((entry) => entry.toStatus === "DELIVERED")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0]
  return delivered?.createdAt ?? null
}
