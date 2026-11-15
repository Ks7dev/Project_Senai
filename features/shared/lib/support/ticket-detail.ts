import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  orderDeliveredAt,
  warrantyCoverage,
} from "@/features/shared/lib/support/ticket-format"
import type {
  TicketKindKey,
  TicketStatusKey,
} from "@/features/shared/lib/support/ticket-status"

/** Name shown to the customer for messages of the team. */
export const TEAM_AUTHOR_LABEL = "Equipe Atelier Bureau"

/** A step of the ticket timeline: status change and/or message. */
export type TicketTimelineEntry = {
  /** Event id. */
  id: string
  /** When it happened, ISO string. */
  at: string
  /** Status before, when the status changed. */
  fromStatus: TicketStatusKey | null
  /** Status after, when the status changed. */
  toStatus: TicketStatusKey | null
  /** Message written, if any. */
  message: string | null
  /** Who wrote it. */
  author: string
  /** Whether the team wrote it. */
  fromTeam: boolean
}

/** A photo or document of the ticket. */
export type TicketFile = {
  /** Attachment id. */
  id: string
  /** File name. */
  name: string
  /** Size in bytes. */
  sizeBytes: number
  /** Whether the team sent it. */
  fromTeam: boolean
  /** When it was sent, ISO string. */
  createdAt: string
}

/** A ticket with its order, item, timeline and files (RF17). */
export type TicketDetail = {
  /** Ticket id. */
  id: string
  /** Readable number. */
  number: string
  /** Warranty or technical assistance. */
  kind: TicketKindKey
  /** Current status. */
  status: TicketStatusKey
  /** Summary written by the customer. */
  subject: string
  /** Description of the problem. */
  description: string
  /** Outcome of the evaluation, once it ends. */
  resolution: string | null
  /** Opening date, ISO string. */
  createdAt: string
  /** End date, ISO string. */
  closedAt: string | null
  /** Who opened it. */
  customer: { name: string; email: string }
  /** Order of the item. */
  order: { id: string; number: string; deliveredAt: string | null }
  /** Item of the order. */
  item: { id: string; name: string; skuCode: string; quantity: number }
  /** Estimated end of the warranty (reference for the team). */
  coverageUntil: string | null
  /** Whether the opening date is inside the estimated coverage. */
  openedWithinCoverage: boolean | null
  /** Timeline, oldest first. */
  timeline: TicketTimelineEntry[]
  /** Photos and documents, oldest first. */
  files: TicketFile[]
}

/** What a ticket detail query loads. */
export const ticketDetailSelect = {
  id: true,
  number: true,
  kind: true,
  status: true,
  subject: true,
  description: true,
  resolution: true,
  createdAt: true,
  closedAt: true,
  user: { select: { name: true, email: true } },
  order: {
    select: {
      id: true,
      number: true,
      shipment: { select: { deliveredAt: true } },
      statusHistory: {
        where: { toStatus: "DELIVERED" },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { toStatus: true, createdAt: true },
      },
    },
  },
  orderItem: {
    select: {
      id: true,
      productName: true,
      skuCode: true,
      quantity: true,
      sku: { select: { product: { select: { warrantyMonths: true } } } },
    },
  },
  events: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      fromStatus: true,
      toStatus: true,
      message: true,
      fromTeam: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  },
  attachments: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      sizeBytes: true,
      fromTeam: true,
      createdAt: true,
    },
  },
} satisfies Prisma.SupportTicketSelect

/** A ticket row loaded with `ticketDetailSelect`. */
export type TicketDetailRow = Prisma.SupportTicketGetPayload<{
  select: typeof ticketDetailSelect
}>

/**
 * Maps a ticket row to what the screens show. The customer sees the
 * team as "Equipe Atelier Bureau"; the team sees who wrote each step.
 *
 * @param row - Ticket loaded with `ticketDetailSelect`.
 * @param audience - Who reads it.
 * @returns The detail.
 */
export function toTicketDetail(
  row: TicketDetailRow,
  audience: "customer" | "team"
): TicketDetail {
  const deliveredAt = orderDeliveredAt({
    shipmentDeliveredAt: row.order.shipment?.deliveredAt,
    history: row.order.statusHistory,
  })
  const coverage = warrantyCoverage({
    deliveredAt,
    warrantyMonths: row.orderItem.sku.product.warrantyMonths,
    now: row.createdAt,
  })
  return {
    id: row.id,
    number: row.number,
    kind: row.kind,
    status: row.status,
    subject: row.subject,
    description: row.description,
    resolution: row.resolution,
    createdAt: row.createdAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    customer: { name: row.user.name, email: row.user.email },
    order: {
      id: row.order.id,
      number: row.order.number,
      deliveredAt: deliveredAt?.toISOString() ?? null,
    },
    item: {
      id: row.orderItem.id,
      name: row.orderItem.productName,
      skuCode: row.orderItem.skuCode,
      quantity: row.orderItem.quantity,
    },
    coverageUntil: coverage.until?.toISOString() ?? null,
    openedWithinCoverage: coverage.withinCoverage,
    timeline: row.events.map((event) => ({
      id: event.id,
      at: event.createdAt.toISOString(),
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      message: event.message,
      author:
        event.fromTeam && audience === "customer"
          ? TEAM_AUTHOR_LABEL
          : (event.author?.name ??
            (event.fromTeam ? TEAM_AUTHOR_LABEL : "Cliente")),
      fromTeam: event.fromTeam,
    })),
    files: row.attachments.map((file) => ({
      id: file.id,
      name: file.name,
      sizeBytes: file.sizeBytes,
      fromTeam: file.fromTeam,
      createdAt: file.createdAt.toISOString(),
    })),
  }
}
