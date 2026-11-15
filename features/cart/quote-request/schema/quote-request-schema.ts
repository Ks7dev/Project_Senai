import { z } from "zod"
import { MAX_LINE_QUANTITY } from "@/features/shared/lib/cart/cart-math"
import {
  MAX_QUOTE_ATTACHMENT_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES,
  QUOTE_ATTACHMENT_FORMATS,
  QUOTE_ATTACHMENT_TYPES,
  type QuoteAttachmentType,
} from "@/features/shared/lib/quotes/quote-attachments"

/** Largest number of lines of one quote request. */
export const MAX_QUOTE_LINES = 50

/** Largest size of the customer notes. */
export const MAX_QUOTE_NOTES = 2000

/** Where the quote request form takes its lines from (RF05). */
export const quoteRequestSourceSchema = z.object({
  /** Product slug, when the customer came from the product page. */
  produto: z.string().trim().max(191).optional(),
  /** "carrinho" to quote the whole cart. */
  origem: z.enum(["carrinho"]).optional(),
})

/** Query string of the quote request page. */
export type QuoteRequestSource = z.input<typeof quoteRequestSourceSchema>

/** A line of the quote request: variation and quantity. */
export const quoteRequestLineSchema = z.object({
  skuId: z.uuid("Escolha a variação do produto."),
  quantity: z
    .number("Informe a quantidade.")
    .int("Informe uma quantidade inteira.")
    .min(1, "A quantidade mínima é 1.")
    .max(MAX_LINE_QUANTITY, `A quantidade máxima é ${MAX_LINE_QUANTITY}.`),
})

/**
 * Quote request for items or for the whole cart (RF05): lines and the
 * customer notes. The attachments travel as files next to it (RF08).
 */
export const quoteRequestSchema = z.object({
  lines: z
    .array(quoteRequestLineSchema)
    .min(1, "Inclua pelo menos um item na cotação.")
    .max(MAX_QUOTE_LINES, `Inclua no máximo ${MAX_QUOTE_LINES} itens.`)
    .refine(
      (lines) => new Set(lines.map((line) => line.skuId)).size === lines.length,
      "Cada variação pode aparecer uma vez só. Ajuste a quantidade."
    ),
  notes: z
    .string()
    .trim()
    .max(MAX_QUOTE_NOTES, `Use no máximo ${MAX_QUOTE_NOTES} caracteres.`)
    .optional()
    .default(""),
})

/** Quote request values, as the form holds them. */
export type QuoteRequestInput = z.input<typeof quoteRequestSchema>

/** Quote request values after validation. */
export type QuoteRequestData = z.output<typeof quoteRequestSchema>

const attachmentTypes = Object.keys(QUOTE_ATTACHMENT_TYPES) as [
  QuoteAttachmentType,
  ...QuoteAttachmentType[],
]

/** Name, declared type and size of one attachment (RF08). */
export const quoteAttachmentMetaSchema = z.object({
  name: z.string().trim().min(1, "Arquivo sem nome.").max(255),
  type: z.enum(
    attachmentTypes,
    `Envie arquivos em ${QUOTE_ATTACHMENT_FORMATS}.`
  ),
  size: z
    .number()
    .int()
    .min(1, "O arquivo está vazio.")
    .max(
      MAX_QUOTE_ATTACHMENT_BYTES,
      `Cada arquivo pode ter até ${MAX_QUOTE_ATTACHMENT_BYTES / (1024 * 1024)} MB.`
    ),
})

/**
 * Attachments of one request: limited types, size per file, number of
 * files and total size (RF08). Checked in the browser and again in the
 * Server Action, which also reads the file signature.
 */
export const quoteAttachmentsSchema = z
  .array(quoteAttachmentMetaSchema)
  .max(
    MAX_QUOTE_ATTACHMENTS,
    `Anexe no máximo ${MAX_QUOTE_ATTACHMENTS} arquivos.`
  )
  .refine(
    (files) =>
      files.reduce((sum, file) => sum + file.size, 0) <=
      MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES,
    `Os anexos somam mais de ${MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES / (1024 * 1024)} MB.`
  )

/** Metadata of the attachments of one request. */
export type QuoteAttachmentsMeta = z.input<typeof quoteAttachmentsSchema>
