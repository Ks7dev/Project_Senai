import { z } from "zod"
import {
  MAX_QUOTE_ATTACHMENT_BYTES,
  MAX_QUOTE_ATTACHMENTS,
  MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES,
  QUOTE_ATTACHMENT_FORMATS,
  QUOTE_ATTACHMENT_TYPES,
  type QuoteAttachmentType,
} from "@/features/shared/lib/quotes/quote-attachments"

const attachmentTypes = Object.keys(QUOTE_ATTACHMENT_TYPES) as [
  QuoteAttachmentType,
  ...QuoteAttachmentType[],
]

/**
 * Name, declared type and size of one photo or document of an
 * after-sales ticket (RF17). Same formats and limits as the quote
 * attachments: PDF or image, 5 MB each.
 */
export const supportAttachmentMetaSchema = z.object({
  name: z.string().trim().min(1, "Arquivo sem nome.").max(255),
  type: z.enum(
    attachmentTypes,
    `Envie fotos ou documentos em ${QUOTE_ATTACHMENT_FORMATS}.`
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
 * Files sent with one ticket message: limited types, size per file,
 * number of files and total size. Checked in the browser and again in
 * the Server Action, which also reads the file signature.
 */
export const supportAttachmentsSchema = z
  .array(supportAttachmentMetaSchema)
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

/** Metadata of the files of one ticket message. */
export type SupportAttachmentsMeta = z.input<typeof supportAttachmentsSchema>

/** An attachment of a ticket, to download. */
export const supportAttachmentSchema = z.object({
  attachmentId: z.uuid("Arquivo inválido."),
})

/** Values of the attachment download. */
export type SupportAttachmentInput = z.input<typeof supportAttachmentSchema>
