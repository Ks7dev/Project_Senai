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

/**
 * Decision of the customer about an answered quote (RF20): accepting
 * lets the sales team turn it into an order with the negotiated values.
 */
export const decideQuoteSchema = z.object({
  quoteId: z.uuid("Cotação inválida."),
  decision: z.enum(["accept", "reject"], "Escolha aprovar ou recusar."),
})

/** Decision input. */
export type DecideQuoteInput = z.input<typeof decideQuoteSchema>

/** An attachment of a quote, by id. */
export const quoteAttachmentSchema = z.object({
  attachmentId: z.uuid("Anexo inválido."),
})

/** Attachment id input. */
export type QuoteAttachmentInput = z.input<typeof quoteAttachmentSchema>
