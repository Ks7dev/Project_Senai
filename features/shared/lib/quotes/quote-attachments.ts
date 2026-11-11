/**
 * Attachment rules of the quote request (RF08): plans and customer
 * specifications as PDF or image. Shared by the form (client) and the
 * Server Action, which also checks the file signature.
 */
export const QUOTE_ATTACHMENT_TYPES = {
  "application/pdf": { extension: "pdf", label: "PDF" },
  "image/png": { extension: "png", label: "PNG" },
  "image/jpeg": { extension: "jpg", label: "JPG" },
  "image/webp": { extension: "webp", label: "WebP" },
} as const

/** Accepted attachment media type. */
export type QuoteAttachmentType = keyof typeof QUOTE_ATTACHMENT_TYPES

/** Largest number of files of one quote request. */
export const MAX_QUOTE_ATTACHMENTS = 5

/** Largest size of one file: 5 MB. */
export const MAX_QUOTE_ATTACHMENT_BYTES = 5 * 1024 * 1024

/**
 * Largest size of all the files of one request: 10 MB, under the
 * Server Action body limit of next.config.ts.
 */
export const MAX_QUOTE_ATTACHMENTS_TOTAL_BYTES = 10 * 1024 * 1024

/** Value of the `accept` attribute of the file input. */
export const QUOTE_ATTACHMENT_ACCEPT = Object.keys(QUOTE_ATTACHMENT_TYPES).join(
  ","
)

/** Human list of the accepted formats. */
export const QUOTE_ATTACHMENT_FORMATS = "PDF, PNG, JPG ou WebP"

/**
 * Whether a value is an accepted attachment type.
 *
 * @param value - Media type declared by the browser.
 * @returns True when accepted.
 */
export function isQuoteAttachmentType(
  value: unknown
): value is QuoteAttachmentType {
  return typeof value === "string" && value in QUOTE_ATTACHMENT_TYPES
}

/**
 * Detects the real type of a file from its first bytes, so a renamed
 * executable never passes as a PDF or an image.
 *
 * @param bytes - File contents (at least the first 12 bytes).
 * @returns The detected type, or null when it is not accepted.
 */
export function detectQuoteAttachmentType(
  bytes: Uint8Array
): QuoteAttachmentType | null {
  const starts = (signature: number[], offset = 0) =>
    signature.every((byte, index) => bytes[offset + index] === byte)
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png"
  }
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg"
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp"
  }
  return null
}

/**
 * Cleans the original file name kept for the download: no folders,
 * control characters or reserved characters, at most 191 characters.
 *
 * @param name - Name sent by the browser.
 * @returns A safe display name.
 */
export function safeAttachmentName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ""
  const clean = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
  return (clean || "anexo").slice(0, 191)
}

/**
 * Formats a size in bytes for the customer, e.g. "1,2 MB".
 *
 * @param bytes - Size in bytes.
 * @returns The formatted size.
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  return `${(bytes / (1024 * 1024)).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  })} MB`
}
