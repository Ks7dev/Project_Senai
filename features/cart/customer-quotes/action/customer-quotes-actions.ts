"use server"

import {
  customerQuoteSchema,
  quoteAttachmentSchema,
  type CustomerQuoteInput,
  type QuoteAttachmentInput,
} from "@/features/cart/customer-quotes/schema/customer-quotes-schema"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  customerQuoteScope,
  loadQuoteCustomer,
  QUOTE_NOT_FOUND_MESSAGE,
  readQuoteAttachment,
  type AttachmentDownload,
} from "@/features/shared/lib/quotes/quote-access"
import type { QuoteStatusKey } from "@/features/shared/lib/quotes/quote-status"

/** A quote row of the customer area. */
export type CustomerQuoteRow = {
  /** Quote id. */
  id: string
  /** Readable number (RF06). */
  number: string
  /** Status. */
  status: QuoteStatusKey
  /** Request date, ISO string. */
  createdAt: string
  /** End of the validity, ISO string, when set (RN02). */
  validUntil: string | null
  /** Total, decimal string. */
  total: string
  /** Who asked for the quote. */
  requester: string
}

/** A line of a quote. */
export type CustomerQuoteLine = {
  /** Line id. */
  id: string
  /** Product and variation. */
  description: string
  /** Units. */
  quantity: number
  /** Unit price, decimal string, or null when not priced yet. */
  unitPrice: string | null
  /** Quantity × unit price, decimal string, or null. */
  total: string | null
}

/** An attachment of a quote. */
export type CustomerQuoteAttachment = {
  /** Attachment id. */
  id: string
  /** Original file name. */
  name: string
  /** Media type. */
  mimeType: string
  /** Size in bytes. */
  sizeBytes: number
}

/** What the quote page of the customer area shows (RF05, RF06, RF08). */
export type CustomerQuote = CustomerQuoteRow & {
  /** Customer notes. */
  notes: string | null
  /** Lines. */
  lines: CustomerQuoteLine[]
  /** Attached files. */
  attachments: CustomerQuoteAttachment[]
  /** Sum of the lines, decimal string. */
  subtotal: string
  /** Discount, decimal string. */
  discount: string
  /** Shipping, decimal string. */
  shippingTotal: string
}

/** Fields of the quote list and page. */
const rowSelect = {
  id: true,
  number: true,
  status: true,
  createdAt: true,
  validUntil: true,
  total: true,
  user: { select: { name: true } },
} as const

/**
 * Maps a loaded quote to a row.
 *
 * @param row - Quote with its requester.
 * @returns The row.
 */
function toRow(row: {
  id: string
  number: string
  status: QuoteStatusKey
  createdAt: Date
  validUntil: Date | null
  total: { toFixed: (digits: number) => string }
  user: { name: string }
}): CustomerQuoteRow {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    validUntil: row.validUntil?.toISOString() ?? null,
    total: row.total.toFixed(2),
    requester: row.user.name,
  }
}

/**
 * Lists the quotes the customer follows, newest first: their own, or
 * the whole company for approvers, finance and account administrators.
 * The user comes from the session.
 *
 * @returns `{ success: true, quotes, companyWide }` or `{ success: false, error }`.
 */
export async function listMyQuotes(): Promise<
  ActionResult<{ quotes: CustomerQuoteRow[]; companyWide: boolean }>
> {
  try {
    const customer = await loadQuoteCustomer()
    const rows = await prisma.quote.findMany({
      where: customerQuoteScope(customer),
      orderBy: { createdAt: "desc" },
      take: 100,
      select: rowSelect,
    })
    return {
      success: true,
      quotes: rows.map(toRow),
      companyWide: customer.seesCompanyQuotes,
    }
  } catch (error) {
    return toActionError(error, { action: "listMyQuotes" })
  }
}

/**
 * Loads one quote the customer follows, with lines, totals and
 * attachments (RF05, RF08).
 *
 * @param input - Quote id.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function getMyQuote(
  input: CustomerQuoteInput
): Promise<ActionResult<{ quote: CustomerQuote }>> {
  try {
    const parsed = customerQuoteSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(QUOTE_NOT_FOUND_MESSAGE, "invalid")
    }
    const customer = await loadQuoteCustomer()
    const quote = await prisma.quote.findFirst({
      where: { id: parsed.data.quoteId, ...customerQuoteScope(customer) },
      select: {
        ...rowSelect,
        notes: true,
        subtotal: true,
        discount: true,
        shippingTotal: true,
        items: {
          orderBy: { id: "asc" },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
          },
        },
        attachments: {
          orderBy: { createdAt: "asc" },
          select: { id: true, name: true, mimeType: true, sizeBytes: true },
        },
      },
    })
    if (!quote) throw new AppError(QUOTE_NOT_FOUND_MESSAGE, "not_found")
    return {
      success: true,
      quote: {
        ...toRow(quote),
        notes: quote.notes,
        subtotal: quote.subtotal.toFixed(2),
        discount: quote.discount.toFixed(2),
        shippingTotal: quote.shippingTotal.toFixed(2),
        lines: quote.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice?.toFixed(2) ?? null,
          total: item.unitPrice
            ? item.unitPrice.mul(item.quantity).toFixed(2)
            : null,
        })),
        attachments: quote.attachments,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getMyQuote" })
  }
}

/**
 * Downloads an attachment of a quote the customer follows (RF08). Files
 * live in the private storage and only leave through this check.
 *
 * @param input - Attachment id.
 * @returns `{ success: true, file }` or `{ success: false, error }`.
 */
export async function downloadMyQuoteAttachment(
  input: QuoteAttachmentInput
): Promise<ActionResult<{ file: AttachmentDownload }>> {
  try {
    const parsed = quoteAttachmentSchema.safeParse(input)
    if (!parsed.success) throw new AppError("Anexo inválido.", "invalid")
    const customer = await loadQuoteCustomer()
    const attachment = await prisma.quoteAttachment.findFirst({
      where: {
        id: parsed.data.attachmentId,
        quote: customerQuoteScope(customer),
      },
      select: { name: true, mimeType: true, storageKey: true },
    })
    if (!attachment) {
      throw new AppError("Anexo não encontrado.", "not_found")
    }
    return { success: true, file: await readQuoteAttachment(attachment) }
  } catch (error) {
    return toActionError(error, { action: "downloadMyQuoteAttachment" })
  }
}
