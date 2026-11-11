import "server-only"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { logger } from "@/features/shared/lib/logger/logger"

/** A transactional e-mail. */
export type EmailMessage = {
  /** Recipient address. */
  to: string
  /** Subject, in Portuguese. */
  subject: string
  /** Plain text body. */
  text: string
  /** Optional HTML body. */
  html?: string
}

/** Folder where e-mails are written until SMTP is configured (#67). */
const OUTBOX_DIR = join(process.cwd(), "storage", "outbox")

/**
 * Sends a transactional e-mail. Until the SMTP transport of issue #67
 * exists, messages are written as JSON files to `storage/outbox`, so
 * links (password reset, invitations) can be opened in development.
 * The log line never includes the recipient or the body.
 *
 * @param message - The e-mail to send.
 * @returns The id of the stored message.
 */
export async function sendEmail(message: EmailMessage): Promise<string> {
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}`
  await mkdir(OUTBOX_DIR, { recursive: true })
  await writeFile(
    join(OUTBOX_DIR, `${id}.json`),
    JSON.stringify(message, null, 2),
    "utf8"
  )
  logger.info("email queued to outbox", { messageId: id })
  return id
}
