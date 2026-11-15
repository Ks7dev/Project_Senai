import { z } from "zod"

/** A quote of the customer area, by id. */
export const customerQuoteSchema = z.object({
  quoteId: z.uuid("Cotação inválida."),
})

/** Quote id input. */
export type CustomerQuoteInput = z.input<typeof customerQuoteSchema>

/** An expired quote whose prices the customer asks to revalidate. */
export const revalidateQuoteSchema = customerQuoteSchema

/** Revalidation input. */
export type RevalidateQuoteInput = z.input<typeof revalidateQuoteSchema>

/** An attachment of a quote, by id. */
export const quoteAttachmentSchema = z.object({
  attachmentId: z.uuid("Anexo inválido."),
})

/** Attachment id input. */
export type QuoteAttachmentInput = z.input<typeof quoteAttachmentSchema>
