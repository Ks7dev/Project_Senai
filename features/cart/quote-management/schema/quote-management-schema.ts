import { z } from "zod"
import { DATE_KEY_PATTERN } from "@/features/shared/lib/delivery/installation-calendar"
import type { QuoteStatusKey } from "@/features/shared/lib/quotes/quote-status"
import { QUOTED_METHOD_KEYS } from "@/features/shared/lib/shipping/quoted-methods"

/** Every quote status, for validation. */
export const QUOTE_STATUS_KEYS = [
  "REQUESTED",
  "IN_REVIEW",
  "ANSWERED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CONVERTED",
] as const satisfies readonly QuoteStatusKey[]

/** Filters of the sales queue: one status, every open quote or all. */
export const QUOTE_QUEUE_FILTERS = [
  "OPEN",
  ...QUOTE_STATUS_KEYS,
  "ALL",
] as const

/** A filter of the sales queue. */
export type QuoteQueueFilter = (typeof QUOTE_QUEUE_FILTERS)[number]

/** Payment methods the sales team may set on a converted order. */
export const CONVERSION_PAYMENT_METHODS = ["CARD", "PIX", "BOLETO"] as const

/** A payment method of a converted order. */
export type ConversionPaymentMethod =
  (typeof CONVERSION_PAYMENT_METHODS)[number]

/**
 * A money value typed in the back office ("1.234,56" is not accepted,
 * "1234,56" and "1234.56" are), normalized to a decimal string.
 *
 * @param required - Message when the value is missing.
 * @returns The schema.
 */
function money(required: string) {
  return z
    .string(required)
    .trim()
    .min(1, required)
    .transform((value) => value.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido.")
        .transform((value) => Number(value).toFixed(2))
    )
}

/** Filters of the sales queue. */
export const quoteQueueSchema = z.object({
  filter: z.enum(QUOTE_QUEUE_FILTERS).optional().default("OPEN"),
  search: z.string().trim().max(60).optional().default(""),
})

/** Queue filters before validation. */
export type QuoteQueueInput = z.input<typeof quoteQueueSchema>

/** A quote of the back office, by id. */
export const adminQuoteSchema = z.object({
  quoteId: z.uuid("Cotação inválida."),
})

/** Quote id input. */
export type AdminQuoteInput = z.input<typeof adminQuoteSchema>

/** An attachment of a quote, by id. */
export const adminQuoteAttachmentSchema = z.object({
  attachmentId: z.uuid("Anexo inválido."),
})

/** Attachment id input. */
export type AdminQuoteAttachmentInput = z.input<
  typeof adminQuoteAttachmentSchema
>

/**
 * Answer of the sales team to a quote (RF20): the negotiated unit price
 * of every line, the discount, the shipping and a message.
 */
export const answerQuoteSchema = z.object({
  quoteId: z.uuid("Cotação inválida."),
  lines: z
    .array(
      z.object({
        itemId: z.uuid("Item inválido."),
        unitPrice: money("Informe o preço unitário.").refine(
          (value) => Number(value) > 0,
          "O preço unitário deve ser maior que zero."
        ),
      })
    )
    .min(1, "A cotação não tem itens.")
    .max(200, "Itens demais na cotação.")
    .refine(
      (lines) =>
        new Set(lines.map((line) => line.itemId)).size === lines.length,
      "Há itens repetidos na resposta."
    ),
  discount: money("Informe o desconto (0 quando não houver)."),
  shippingTotal: money("Informe o frete (0 quando não houver)."),
  note: z
    .string()
    .trim()
    .max(2000, "Use no máximo 2000 caracteres.")
    .optional()
    .default(""),
})

/** Answer form values. */
export type AnswerQuoteInput = z.input<typeof answerQuoteSchema>

/** Answer values after validation. */
export type AnswerQuoteData = z.output<typeof answerQuoteSchema>

/**
 * Conversion of an accepted quote into an order (RF20): where it is
 * delivered, how it is paid and shipped. Prices are not part of the
 * input: the order keeps the values negotiated in the quote.
 */
export const convertQuoteSchema = z.object({
  quoteId: z.uuid("Cotação inválida."),
  addressId: z.uuid("Escolha o endereço de entrega."),
  paymentMethod: z.enum(
    CONVERSION_PAYMENT_METHODS,
    "Escolha a forma de pagamento."
  ),
  shippingMethod: z.enum(QUOTED_METHOD_KEYS, "Escolha a modalidade de frete."),
  carrier: z
    .string()
    .trim()
    .max(120, "Use no máximo 120 caracteres.")
    .optional()
    .default(""),
  deliveryDays: z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, "Prazo inválido.")
    .optional()
    .default("")
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= 1 && value <= 365),
      "O prazo deve ficar entre 1 e 365 dias úteis."
    ),
  installationDate: z
    .string()
    .trim()
    .optional()
    .default("")
    .refine(
      (value) => value === "" || DATE_KEY_PATTERN.test(value),
      "Data de instalação inválida."
    )
    .transform((value) => (value === "" ? null : value)),
})

/** Conversion form values. */
export type ConvertQuoteInput = z.input<typeof convertQuoteSchema>

/** Conversion values after validation. */
export type ConvertQuoteData = z.output<typeof convertQuoteSchema>
