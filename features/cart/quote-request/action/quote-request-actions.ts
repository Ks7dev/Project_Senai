"use server"

import { randomUUID } from "node:crypto"
import { quoteEmail } from "@/emails/templates"
import {
  quoteAttachmentsSchema,
  quoteRequestSchema,
  quoteRequestSourceSchema,
  type QuoteRequestInput,
  type QuoteRequestSource,
} from "@/features/cart/quote-request/schema/quote-request-schema"
import {
  findActiveCartId,
  purchasableSkuWhere,
} from "@/features/shared/lib/cart/cart-store"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { requireQuoteRequester } from "@/features/shared/lib/quotes/quote-access"
import { loadQuoteValidityDays } from "@/features/shared/lib/quotes/quote-expiration"
import {
  detectQuoteAttachmentType,
  QUOTE_ATTACHMENT_FORMATS,
  QUOTE_ATTACHMENT_TYPES,
  safeAttachmentName,
  type QuoteAttachmentType,
} from "@/features/shared/lib/quotes/quote-attachments"
import {
  isRetryableQuoteError,
  nextQuoteNumber,
} from "@/features/shared/lib/quotes/quote-number"
import {
  catalogUnitPrice,
  quoteTotals,
} from "@/features/shared/lib/quotes/quote-pricing"
import { quoteValidUntil } from "@/features/shared/lib/quotes/quote-validity"
import { deleteFile, saveFile } from "@/features/shared/lib/storage/storage"

/** A variation the customer may pick for a line. */
export type QuoteFormVariation = {
  /** SKU id. */
  skuId: string
  /** Variation name and code. */
  label: string
  /** Current catalog price, decimal string (reference only). */
  unitPrice: string
}

/** A line of the quote request form. */
export type QuoteFormLine = {
  /** Product name. */
  productName: string
  /** Product slug, for the link back to the product page. */
  productSlug: string
  /** Variations of the product the customer may choose. */
  variations: QuoteFormVariation[]
  /** Variation preselected. */
  skuId: string
  /** Quantity preselected. */
  quantity: number
}

/** What the quote request page starts with. */
export type QuoteRequestForm = {
  /** Where the lines came from. */
  source: "product" | "cart" | "empty"
  /** Lines to quote. */
  lines: QuoteFormLine[]
}

/** The quote created by the request. */
export type RequestedQuote = {
  /** Quote id. */
  quoteId: string
  /** Readable quote number (RF06). */
  number: string
}

/** How many times a conflicting quote number is retried. */
const QUOTE_NUMBER_ATTEMPTS = 3

/** Catalog data loaded for each SKU of the form. */
const skuSelect = {
  id: true,
  code: true,
  name: true,
  price: true,
  product: {
    select: { id: true, name: true, slug: true, basePrice: true },
  },
} as const

/**
 * Label of a variation in the form.
 *
 * @param sku - Variation name and code.
 * @returns "Nogueira (CAD-001)".
 */
function variationLabel(sku: { name: string; code: string }): string {
  return `${sku.name} (${sku.code})`
}

/**
 * Loads the lines the quote request starts with (RF05): the variations
 * of the product the customer came from, or the purchasable lines of
 * their cart. The user comes from the session.
 *
 * @param input - Query string: `produto` or `origem=carrinho`.
 * @returns `{ success: true, form }` or `{ success: false, error }`.
 */
export async function getQuoteRequestForm(
  input: QuoteRequestSource
): Promise<ActionResult<{ form: QuoteRequestForm }>> {
  try {
    const parsed = quoteRequestSourceSchema.safeParse(input)
    const source = parsed.success ? parsed.data : {}
    const customer = await requireQuoteRequester()

    if (source.origem === "carrinho") {
      const cartId = await findActiveCartId({ userId: customer.user.id })
      const items = cartId
        ? await prisma.cartItem.findMany({
            where: { cartId, sku: purchasableSkuWhere() },
            orderBy: { createdAt: "asc" },
            select: { quantity: true, sku: { select: skuSelect } },
          })
        : []
      return {
        success: true,
        form: {
          source: items.length > 0 ? "cart" : "empty",
          lines: items.map(({ quantity, sku }) => ({
            productName: sku.product.name,
            productSlug: sku.product.slug,
            variations: [
              {
                skuId: sku.id,
                label: variationLabel(sku),
                unitPrice: catalogUnitPrice(sku),
              },
            ],
            skuId: sku.id,
            quantity,
          })),
        },
      }
    }

    if (source.produto) {
      const skus = await prisma.sku.findMany({
        where: { ...purchasableSkuWhere(), product: { slug: source.produto } },
        orderBy: { code: "asc" },
        select: skuSelect,
      })
      if (skus.length > 0) {
        const [first] = skus
        return {
          success: true,
          form: {
            source: "product",
            lines: [
              {
                productName: first.product.name,
                productSlug: first.product.slug,
                variations: skus.map((sku) => ({
                  skuId: sku.id,
                  label: variationLabel(sku),
                  unitPrice: catalogUnitPrice(sku),
                })),
                skuId: first.id,
                quantity: 1,
              },
            ],
          },
        }
      }
    }
    return { success: true, form: { source: "empty", lines: [] } }
  } catch (error) {
    return toActionError(error, { action: "getQuoteRequestForm" })
  }
}

/** An attachment read from the request, checked and ready to store. */
type CheckedAttachment = {
  name: string
  mimeType: QuoteAttachmentType
  data: Buffer
  storageKey: string
}

/**
 * Reads and checks the attached files (RF08): accepted types, size per
 * file, number of files and total size, and the real type read from
 * the file signature (the browser type is not trusted).
 *
 * @param formData - Request form data.
 * @returns The checked files.
 * @throws AppError("invalid_attachment").
 */
async function readAttachments(
  formData: FormData
): Promise<CheckedAttachment[]> {
  const files = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0)
  const meta = quoteAttachmentsSchema.safeParse(
    files.map((file) => ({ name: file.name, type: file.type, size: file.size }))
  )
  if (!meta.success) {
    throw new AppError(
      meta.error.issues[0]?.message ?? "Revise os anexos.",
      "invalid_attachment"
    )
  }
  const folder = randomUUID()
  return Promise.all(
    files.map(async (file, index) => {
      const data = Buffer.from(await file.arrayBuffer())
      const mimeType = detectQuoteAttachmentType(data)
      if (!mimeType) {
        throw new AppError(
          `O arquivo "${safeAttachmentName(file.name)}" não é um ${QUOTE_ATTACHMENT_FORMATS} válido.`,
          "invalid_attachment"
        )
      }
      const extension = QUOTE_ATTACHMENT_TYPES[mimeType].extension
      return {
        name: safeAttachmentName(file.name),
        mimeType,
        data,
        storageKey: `quotes/${folder}/${index + 1}.${extension}`,
      }
    })
  )
}

/**
 * Parses the JSON payload of the request form.
 *
 * @param formData - Request form data.
 * @returns The raw values.
 */
function readPayload(formData: FormData): unknown {
  const raw = formData.get("payload")
  if (typeof raw !== "string") return null
  try {
    return JSON.parse(raw) as QuoteRequestInput
  } catch {
    return null
  }
}

/**
 * Requests a formal quote for items or for the whole cart (RF05) with
 * attached plans or specifications (RF08). Validates the lines and the
 * files, stores the files in the private storage and, in one
 * transaction, numbers the quote (RF06), copies the lines with the
 * current catalog price as reference, valid for the configured number
 * of calendar days (RN02), records the attachments, queues the "quote
 * received" e-mail (RF53) and writes the audit log (RNF12).
 * Files of a request that fails are removed.
 *
 * @param formData - `payload` (JSON with lines and notes) and the
 *   `attachments` files.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function requestQuote(
  formData: FormData
): Promise<ActionResult<{ quote: RequestedQuote }>> {
  const stored: string[] = []
  try {
    const parsed = quoteRequestSchema.safeParse(readPayload(formData))
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a cotação.",
        "invalid"
      )
    }
    const customer = await requireQuoteRequester()
    await enforceActionRateLimit("quote-request", {
      limit: 5,
      windowMs: 60_000,
    })
    const attachments = await readAttachments(formData)
    const data = parsed.data

    const skus = await prisma.sku.findMany({
      where: {
        ...purchasableSkuWhere(),
        id: { in: data.lines.map((line) => line.skuId) },
      },
      select: skuSelect,
    })
    const byId = new Map(skus.map((sku) => [sku.id, sku]))
    if (data.lines.some((line) => !byId.has(line.skuId))) {
      throw new AppError(
        "Há itens indisponíveis na cotação. Remova-os e tente de novo.",
        "unavailable_line"
      )
    }
    const lines = data.lines.map((line) => {
      const sku = byId.get(line.skuId)!
      return {
        productId: sku.product.id,
        skuId: sku.id,
        description: `${sku.product.name} — ${sku.name}`.slice(0, 255),
        quantity: line.quantity,
        unitPrice: catalogUnitPrice(sku),
      }
    })
    const totals = quoteTotals(lines)

    for (const attachment of attachments) {
      await saveFile(attachment.storageKey, attachment.data)
      stored.push(attachment.storageKey)
    }

    const now = new Date()
    const run = () =>
      prisma.$transaction(async (tx) => {
        const number = await nextQuoteNumber(tx, now)
        const validUntil = quoteValidUntil(now, await loadQuoteValidityDays(tx))
        const quote = await tx.quote.create({
          data: {
            number,
            userId: customer.user.id,
            organizationId: customer.organizationId,
            status: "REQUESTED",
            notes: data.notes || null,
            subtotal: totals.subtotal,
            total: totals.total,
            validUntil,
            createdAt: now,
            items: { create: lines },
            attachments: {
              create: attachments.map((attachment) => ({
                name: attachment.name,
                mimeType: attachment.mimeType,
                sizeBytes: attachment.data.length,
                storageKey: attachment.storageKey,
              })),
            },
          },
          select: { id: true },
        })
        const email = quoteEmail({
          name: customer.user.name,
          number,
          stage: "received",
          url: `${siteUrl()}/conta/cotacoes/${quote.id}`,
        })
        await enqueueEmail(tx, { to: customer.user.email, ...email }, now)
        await writeAudit(tx, {
          userId: customer.user.id,
          action: "quote.request",
          entity: "quote",
          entityId: quote.id,
          after: {
            number,
            lines: lines.length,
            attachments: attachments.length,
            total: totals.total,
            validUntil,
          },
        })
        return { quoteId: quote.id, number }
      })

    let quote: RequestedQuote | undefined
    for (let attempt = 1; !quote; attempt += 1) {
      try {
        quote = await run()
      } catch (error) {
        if (attempt >= QUOTE_NUMBER_ATTEMPTS || !isRetryableQuoteError(error)) {
          throw error
        }
      }
    }
    return { success: true, quote }
  } catch (error) {
    await Promise.all(
      stored.map((key) =>
        deleteFile(key).catch(() =>
          logger.warn("quote attachment cleanup failed")
        )
      )
    )
    return toActionError(error, { action: "requestQuote" })
  }
}
