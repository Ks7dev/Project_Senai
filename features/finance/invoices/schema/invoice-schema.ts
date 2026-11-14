import { z } from "zod"

/** Filters of the NF-e list. */
export const INVOICE_FILTERS = [
  "FAILED",
  "IN_PROGRESS",
  "ISSUED",
  "ALL",
] as const

/** A filter of the NF-e list. */
export type InvoiceFilter = (typeof INVOICE_FILTERS)[number]

/** Files of an issued NF-e. */
export const INVOICE_FILES = ["xml", "danfe"] as const

/** A file of an issued NF-e. */
export type InvoiceFileKind = (typeof INVOICE_FILES)[number]

/** Filter and search by order number of the NF-e list. */
export const invoicesFilterSchema = z.object({
  filter: z.enum(INVOICE_FILTERS).optional().default("ALL"),
  search: z.string().trim().toUpperCase().max(20).optional().default(""),
})

/** Filter values. */
export type InvoicesFilterInput = z.input<typeof invoicesFilterSchema>

/** Manual reprocess of an NF-e that failed (RF13). */
export const reprocessInvoiceSchema = z.object({
  invoiceId: z.uuid("NF-e inválida."),
})

/** Reprocess values. */
export type ReprocessInvoiceInput = z.input<typeof reprocessInvoiceSchema>

/** Download of the XML or the DANFE of an issued NF-e. */
export const invoiceFileSchema = z.object({
  invoiceId: z.uuid("NF-e inválida."),
  kind: z.enum(INVOICE_FILES),
})

/** Download values. */
export type InvoiceFileInput = z.input<typeof invoiceFileSchema>
