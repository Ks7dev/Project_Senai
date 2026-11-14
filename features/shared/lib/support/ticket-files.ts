import "server-only"
import { randomUUID } from "node:crypto"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  detectQuoteAttachmentType,
  QUOTE_ATTACHMENT_FORMATS,
  QUOTE_ATTACHMENT_TYPES,
  safeAttachmentName,
  type QuoteAttachmentType,
} from "@/features/shared/lib/quotes/quote-attachments"
import { deleteFile, saveFile } from "@/features/shared/lib/storage/storage"
import { supportAttachmentsSchema } from "@/features/shared/schema/support-attachments-schema"

/** A file read from the request, checked and ready to store. */
export type CheckedTicketFile = {
  /** Safe display name. */
  name: string
  /** Real type, read from the file signature. */
  mimeType: QuoteAttachmentType
  /** Contents. */
  data: Buffer
  /** Key in the private storage. */
  storageKey: string
}

/**
 * Reads and checks the files of a ticket message (RF17): accepted
 * types, size per file, number of files and total size, and the real
 * type read from the file signature (the browser type is not trusted).
 *
 * @param formData - Request form data with the `attachments` files.
 * @returns The checked files, not stored yet.
 * @throws AppError("invalid_attachment").
 */
export async function readTicketFiles(
  formData: FormData
): Promise<CheckedTicketFile[]> {
  const files = formData
    .getAll("attachments")
    .filter((value): value is File => value instanceof File && value.size > 0)
  const meta = supportAttachmentsSchema.safeParse(
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
        storageKey: `support/${folder}/${index + 1}.${extension}`,
      }
    })
  )
}

/**
 * Stores checked files in the private storage, recording each saved key
 * so a failed request can remove them.
 *
 * @param files - Checked files.
 * @param stored - List that receives the saved keys.
 */
export async function storeTicketFiles(
  files: CheckedTicketFile[],
  stored: string[]
): Promise<void> {
  for (const file of files) {
    await saveFile(file.storageKey, file.data)
    stored.push(file.storageKey)
  }
}

/**
 * Removes the files of a request that failed after storing them.
 *
 * @param stored - Saved keys.
 */
export async function discardTicketFiles(stored: string[]): Promise<void> {
  await Promise.all(
    stored.map((key) =>
      deleteFile(key).catch(() =>
        logger.warn("support attachment cleanup failed")
      )
    )
  )
}

/**
 * Rows of the attachments table for checked files.
 *
 * @param files - Checked and stored files.
 * @param fromTeam - Whether the team sent them.
 * @returns The create data.
 */
export function ticketAttachmentRows(
  files: CheckedTicketFile[],
  fromTeam: boolean
) {
  return files.map((file) => ({
    name: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.data.length,
    storageKey: file.storageKey,
    fromTeam,
  }))
}
