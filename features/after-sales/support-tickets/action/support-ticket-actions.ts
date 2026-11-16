"use server"

import { supportTicketEmail } from "@/emails/templates"
import {
  openTicketSchema,
  ticketFormSourceSchema,
  ticketIdSchema,
  ticketReplySchema,
  type TicketFormSource,
  type TicketIdInput,
} from "@/features/after-sales/support-tickets/schema/support-ticket-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { getNumberSetting } from "@/features/shared/lib/settings/settings"
import {
  readQuoteAttachment,
  type AttachmentDownload,
} from "@/features/shared/lib/quotes/quote-access"
import { isRetryableQuoteError } from "@/features/shared/lib/quotes/quote-number"
import {
  loadSupportCustomer,
  supportOrderScope,
  supportTicketScope,
  TICKET_NOT_FOUND_MESSAGE,
} from "@/features/shared/lib/support/ticket-access"
import {
  ticketDetailSelect,
  toTicketDetail,
  type TicketDetail,
} from "@/features/shared/lib/support/ticket-detail"
import {
  discardTicketFiles,
  readTicketFiles,
  storeTicketFiles,
  ticketAttachmentRows,
} from "@/features/shared/lib/support/ticket-files"
import {
  orderDeliveredAt,
  SUPPORT_ELIGIBLE_ORDER_STATUSES,
} from "@/features/shared/lib/support/ticket-format"
import { nextTicketNumber } from "@/features/shared/lib/support/ticket-number"
import {
  checkReturnEligibility,
  isPersonalizedItem,
  isReturnKind,
  purchasePersonType,
  WITHDRAWAL_DAYS_SETTING,
  withdrawalDeadline,
} from "@/features/shared/lib/support/return-policy"
import {
  isFinalTicketStatus,
  statusAfterCustomerReply,
  TICKET_STATUS,
  type TicketKindKey,
  type TicketStatusKey,
} from "@/features/shared/lib/support/ticket-status"
import {
  supportAttachmentSchema,
  type SupportAttachmentInput,
} from "@/features/shared/schema/support-attachments-schema"

/** How many times a conflicting ticket number is retried. */
const TICKET_NUMBER_ATTEMPTS = 3

/** Message when the order cannot receive a ticket. */
const ORDER_NOT_ELIGIBLE_MESSAGE =
  "Escolha um produto de um pedido já entregue para abrir o chamado."

/** A delivered order the customer may open a ticket for. */
export type TicketFormOrder = {
  /** Order id. */
  orderId: string
  /** Readable order number. */
  number: string
  /** Delivery date, ISO string. */
  deliveredAt: string | null
  /** Person type of the purchase (RN12, RN22). */
  personType: "PF" | "PJ"
  /** End (exclusive) of the PF withdrawal right, ISO string; null for PJ. */
  withdrawalUntil: string | null
  /** Items of the order. */
  items: Array<{
    id: string
    name: string
    quantity: number
    /** Personalized or made to measure (RF51). */
    personalized: boolean
  }>
}

/** What the new ticket page starts with. */
export type TicketForm = {
  /** Delivered orders in the customer scope, newest first. */
  orders: TicketFormOrder[]
  /** Preselected order, when it is in the list. */
  orderId: string | null
  /** Preselected item, when it belongs to the preselected order. */
  orderItemId: string | null
  /** Preselected kind, from the order page links. */
  kind: TicketKindKey
}

/** Kind preselected by the `tipo` query string. */
const SOURCE_KIND: Record<string, TicketKindKey> = {
  troca: "EXCHANGE",
  devolucao: "RETURN",
  arrependimento: "WITHDRAWAL",
}

/** A ticket of the customer list. */
export type MyTicketRow = {
  /** Ticket id. */
  id: string
  /** Readable number. */
  number: string
  /** Kind. */
  kind: TicketKindKey
  /** Status. */
  status: TicketStatusKey
  /** Summary. */
  subject: string
  /** Order number. */
  orderNumber: string
  /** Product name. */
  itemName: string
  /** Last change, ISO string. */
  updatedAt: string
}

/**
 * E-mail text of a new ticket: the withdrawal promises the full refund
 * after the receipt check; the other kinds go to the evaluation.
 *
 * @param kind - Ticket kind.
 * @param product - Product name.
 * @param order - Order number.
 * @returns The message.
 */
function openedMessage(
  kind: TicketKindKey,
  product: string,
  order: string
): string {
  if (kind === "WITHDRAWAL") {
    return `Recebemos o seu pedido de arrependimento de "${product}" do pedido ${order}. A equipe vai combinar a coleta, sem custo para você; o reembolso é integral e sai pelo mesmo meio de pagamento depois da conferência do produto.`
  }
  if (kind === "EXCHANGE" || kind === "RETURN") {
    return `Recebemos a sua solicitação sobre "${product}" do pedido ${order}. Toda troca ou devolução passa pela avaliação técnica do produto, e o resultado é informado pelo site antes de qualquer troca, reparo ou reembolso.`
  }
  return `Recebemos o seu chamado sobre "${product}" do pedido ${order}. A equipe técnica vai analisar e responder pelo site.`
}

/**
 * Parses the JSON payload of a ticket form.
 *
 * @param formData - Request form data.
 * @returns The raw values, or null.
 */
function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload")
  if (typeof raw !== "string") return null
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/**
 * Loads the delivered orders the customer may open a warranty or
 * technical assistance ticket for (RF17), with the order and item the
 * customer came from preselected. The user comes from the session.
 *
 * @param input - Query string: `pedido` and `item`.
 * @returns `{ success: true, form }` or `{ success: false, error }`.
 */
export async function getTicketForm(
  input: TicketFormSource
): Promise<ActionResult<{ form: TicketForm }>> {
  try {
    const source = ticketFormSourceSchema.parse(input ?? {})
    const customer = await loadSupportCustomer()
    const withdrawalDays = await getNumberSetting(WITHDRAWAL_DAYS_SETTING)
    const rows = await prisma.order.findMany({
      where: {
        ...supportOrderScope(customer),
        status: { in: [...SUPPORT_ELIGIBLE_ORDER_STATUSES] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        number: true,
        organizationId: true,
        user: { select: { personType: true } },
        shipment: { select: { deliveredAt: true } },
        statusHistory: {
          where: { toStatus: "DELIVERED" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { toStatus: true, createdAt: true },
        },
        items: {
          select: {
            id: true,
            productName: true,
            quantity: true,
            personalization: true,
          },
        },
      },
    })
    const orders = rows.map((row): TicketFormOrder => {
      const deliveredAt = orderDeliveredAt({
        shipmentDeliveredAt: row.shipment?.deliveredAt,
        history: row.statusHistory,
      })
      const personType = purchasePersonType({
        organizationId: row.organizationId,
        buyerPersonType: row.user.personType,
      })
      return {
        orderId: row.id,
        number: row.number,
        deliveredAt: deliveredAt?.toISOString() ?? null,
        personType,
        withdrawalUntil:
          personType === "PF" && deliveredAt
            ? withdrawalDeadline(deliveredAt, withdrawalDays).toISOString()
            : null,
        items: row.items.map((item) => ({
          id: item.id,
          name: item.productName,
          quantity: item.quantity,
          personalized: isPersonalizedItem(item.personalization),
        })),
      }
    })
    const order = orders.find((row) => row.orderId === source.pedido) ?? null
    const item = order?.items.find((row) => row.id === source.item) ?? null
    return {
      success: true,
      form: {
        orders,
        orderId: order?.orderId ?? null,
        orderItemId: item?.id ?? null,
        kind: source.tipo ? SOURCE_KIND[source.tipo] : "WARRANTY",
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getTicketForm" })
  }
}

/**
 * Opens a warranty, technical assistance, exchange, return or withdrawal
 * ticket for an item of a delivered order (RF17, RN12, RN22), with
 * photos or documents of the problem. Exchanges, returns and
 * withdrawals are checked against the commercial policy: PF withdrawal
 * within the configured withdrawal days of the receipt (never below the
 * legal 7 days); PJ personalized items only for a
 * manufacturing defect; everything else goes to the technical
 * evaluation. Checks the order scope of the session user, stores the files in the
 * private storage and, in one transaction, numbers the ticket, records
 * the first step of the timeline and the files, queues the "ticket
 * opened" e-mail (RF53) and writes the audit log (RNF12). Files of a
 * request that fails are removed.
 *
 * @param formData - `payload` (JSON with order, item, kind, subject and
 *   description) and the `attachments` files.
 * @returns `{ success: true, ticketId, number }` or `{ success: false }`.
 */
export async function openSupportTicket(
  formData: FormData
): Promise<ActionResult<{ ticketId: string; number: string }>> {
  const stored: string[] = []
  try {
    const parsed = openTicketSchema.safeParse(readPayload(formData))
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o chamado.",
        "invalid"
      )
    }
    const customer = await loadSupportCustomer()
    await enforceActionRateLimit("support-ticket", {
      limit: 5,
      windowMs: 60_000,
    })
    const files = await readTicketFiles(formData)
    const data = parsed.data

    const item = await prisma.orderItem.findFirst({
      where: {
        id: data.orderItemId,
        order: {
          id: data.orderId,
          ...supportOrderScope(customer),
          status: { in: [...SUPPORT_ELIGIBLE_ORDER_STATUSES] },
        },
      },
      select: {
        id: true,
        productName: true,
        personalization: true,
        order: {
          select: {
            id: true,
            number: true,
            organizationId: true,
            user: { select: { personType: true } },
            shipment: { select: { deliveredAt: true } },
            statusHistory: {
              where: { toStatus: "DELIVERED" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { toStatus: true, createdAt: true },
            },
          },
        },
      },
    })
    if (!item) throw new AppError(ORDER_NOT_ELIGIBLE_MESSAGE, "not_eligible")

    const personalized = isPersonalizedItem(item.personalization)
    let legalReview = false
    if (isReturnKind(data.kind)) {
      const eligibility = checkReturnEligibility({
        kind: data.kind,
        reason: data.returnReason,
        personType: purchasePersonType({
          organizationId: item.order.organizationId,
          buyerPersonType: item.order.user.personType,
        }),
        personalized,
        deliveredAt: orderDeliveredAt({
          shipmentDeliveredAt: item.order.shipment?.deliveredAt,
          history: item.order.statusHistory,
        }),
        now: new Date(),
        withdrawalDays: await getNumberSetting(WITHDRAWAL_DAYS_SETTING),
      })
      if (!eligibility.allowed) {
        throw new AppError(eligibility.message, "return_not_allowed")
      }
      legalReview = eligibility.legalReview
    }

    await storeTicketFiles(files, stored)

    const now = new Date()
    const run = () =>
      prisma.$transaction(async (tx) => {
        const number = await nextTicketNumber(tx, now)
        const ticket = await tx.supportTicket.create({
          data: {
            number,
            kind: data.kind,
            status: "OPEN",
            userId: customer.user.id,
            organizationId: item.order.organizationId,
            orderId: item.order.id,
            orderItemId: item.id,
            subject: data.subject,
            description: data.description,
            returnReason: data.returnReason,
            personalized,
            legalReview,
            createdAt: now,
            events: {
              create: {
                toStatus: "OPEN",
                authorId: customer.user.id,
                fromTeam: false,
                createdAt: now,
              },
            },
            attachments: { create: ticketAttachmentRows(files, false) },
          },
          select: { id: true },
        })
        const email = supportTicketEmail({
          name: customer.user.name,
          number,
          status: TICKET_STATUS.OPEN.label,
          message: openedMessage(
            data.kind,
            item.productName,
            item.order.number
          ),
          url: `${siteUrl()}/conta/chamados/${ticket.id}`,
        })
        await enqueueEmail(tx, { to: customer.user.email, ...email }, now)
        await writeAudit(tx, {
          userId: customer.user.id,
          action: "support_ticket.open",
          entity: "support_ticket",
          entityId: ticket.id,
          after: {
            number,
            kind: data.kind,
            returnReason: data.returnReason,
            legalReview,
            orderId: item.order.id,
            orderItemId: item.id,
            attachments: files.length,
          },
        })
        return { ticketId: ticket.id, number }
      })

    let opened: { ticketId: string; number: string } | undefined
    for (let attempt = 1; !opened; attempt += 1) {
      try {
        opened = await run()
      } catch (error) {
        if (
          attempt >= TICKET_NUMBER_ATTEMPTS ||
          !isRetryableQuoteError(error)
        ) {
          throw error
        }
      }
    }
    return { success: true, ...opened }
  } catch (error) {
    await discardTicketFiles(stored)
    return toActionError(error, { action: "openSupportTicket" })
  }
}

/**
 * Lists the tickets the customer follows (RF17), newest change first.
 * The scope comes from the session.
 *
 * @returns `{ success: true, tickets }` or `{ success: false, error }`.
 */
export async function listMySupportTickets(): Promise<
  ActionResult<{ tickets: MyTicketRow[] }>
> {
  try {
    const customer = await loadSupportCustomer()
    const rows = await prisma.supportTicket.findMany({
      where: supportTicketScope(customer),
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        id: true,
        number: true,
        kind: true,
        status: true,
        subject: true,
        updatedAt: true,
        order: { select: { number: true } },
        orderItem: { select: { productName: true } },
      },
    })
    return {
      success: true,
      tickets: rows.map((row) => ({
        id: row.id,
        number: row.number,
        kind: row.kind,
        status: row.status,
        subject: row.subject,
        orderNumber: row.order.number,
        itemName: row.orderItem.productName,
        updatedAt: row.updatedAt.toISOString(),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listMySupportTickets" })
  }
}

/**
 * Loads a ticket the customer follows, with the status, the timeline
 * and the files (RF17: status followed by the customer).
 *
 * @param input - Ticket id.
 * @returns `{ success: true, ticket }` or `{ success: false, error }`.
 */
export async function getMySupportTicket(
  input: TicketIdInput
): Promise<ActionResult<{ ticket: TicketDetail }>> {
  try {
    const parsed = ticketIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Chamado inválido.", "invalid")
    const customer = await loadSupportCustomer()
    const row = await prisma.supportTicket.findFirst({
      where: { id: parsed.data.ticketId, ...supportTicketScope(customer) },
      select: ticketDetailSelect,
    })
    if (!row) throw new AppError(TICKET_NOT_FOUND_MESSAGE, "not_found")
    return { success: true, ticket: toTicketDetail(row, "customer") }
  } catch (error) {
    return toActionError(error, { action: "getMySupportTicket" })
  }
}

/**
 * Adds a customer message, with optional photos, to an open ticket. A
 * ticket waiting for the customer goes back to the team. Finished
 * tickets do not take messages.
 *
 * @param formData - `payload` (JSON with ticket id and message) and the
 *   `attachments` files.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function replyToSupportTicket(
  formData: FormData
): Promise<ActionResult> {
  const stored: string[] = []
  try {
    const parsed = ticketReplySchema.safeParse(readPayload(formData))
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a mensagem.",
        "invalid"
      )
    }
    const customer = await loadSupportCustomer()
    await enforceActionRateLimit("support-reply", {
      limit: 10,
      windowMs: 60_000,
    })
    const files = await readTicketFiles(formData)
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: parsed.data.ticketId, ...supportTicketScope(customer) },
      select: { id: true, status: true },
    })
    if (!ticket) throw new AppError(TICKET_NOT_FOUND_MESSAGE, "not_found")
    if (isFinalTicketStatus(ticket.status)) {
      throw new AppError(
        "Este chamado já foi encerrado. Abra um novo chamado se precisar.",
        "ticket_closed"
      )
    }

    await storeTicketFiles(files, stored)
    const next = statusAfterCustomerReply(ticket.status)
    await prisma.$transaction(async (tx) => {
      const changed = await tx.supportTicket.updateMany({
        where: { id: ticket.id, status: ticket.status },
        data: { status: next },
      })
      if (changed.count === 0) {
        throw new AppError(
          "O chamado mudou enquanto você escrevia. Recarregue a página.",
          "stale"
        )
      }
      await tx.supportTicketEvent.create({
        data: {
          ticketId: ticket.id,
          fromStatus: next === ticket.status ? null : ticket.status,
          toStatus: next === ticket.status ? null : next,
          message: parsed.data.message,
          authorId: customer.user.id,
          fromTeam: false,
        },
      })
      if (files.length > 0) {
        await tx.supportTicketAttachment.createMany({
          data: ticketAttachmentRows(files, false).map((row) => ({
            ...row,
            ticketId: ticket.id,
          })),
        })
      }
    })
    return { success: true }
  } catch (error) {
    await discardTicketFiles(stored)
    return toActionError(error, { action: "replyToSupportTicket" })
  }
}

/**
 * Downloads a photo or document of a ticket the customer follows.
 * Files are never served by the public /media route.
 *
 * @param input - Attachment id.
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function downloadMySupportAttachment(
  input: SupportAttachmentInput
): Promise<ActionResult<{ file: AttachmentDownload }>> {
  try {
    const parsed = supportAttachmentSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Arquivo inválido.", "invalid")
    const customer = await loadSupportCustomer()
    const attachment = await prisma.supportTicketAttachment.findFirst({
      where: {
        id: parsed.data.attachmentId,
        ticket: supportTicketScope(customer),
      },
      select: { name: true, mimeType: true, storageKey: true },
    })
    if (!attachment) {
      throw new AppError("Arquivo não encontrado.", "not_found")
    }
    return { success: true, file: await readQuoteAttachment(attachment) }
  } catch (error) {
    return toActionError(error, { action: "downloadMySupportAttachment" })
  }
}
