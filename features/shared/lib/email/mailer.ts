import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { textToEmailHtml } from "@/emails/layout"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  getEmailTransport,
  type EmailTransport,
} from "@/features/shared/lib/email/transport"
import { logger } from "@/features/shared/lib/logger/logger"

/** A transactional e-mail. */
export type EmailMessage = {
  /** Recipient address. */
  to: string
  /** Subject, in Portuguese. */
  subject: string
  /** Plain text body. */
  text: string
  /** HTML body; when missing, the text is wrapped in the brand layout. */
  html?: string
  /** Template key for tracking, e.g. "order.paid". */
  template?: string
}

/** Attempts before an e-mail is marked as failed. */
export const MAX_EMAIL_ATTEMPTS = 5

/** Wait before each new attempt, in minutes (1st, 2nd, 3rd, 4th retry). */
export const EMAIL_RETRY_MINUTES = [1, 5, 15, 60] as const

/** How many e-mails one queue run handles at most. */
const QUEUE_BATCH = 50

/**
 * When the next attempt may happen after a number of attempts.
 *
 * @param attempts - Attempts made so far.
 * @param now - Reference time.
 * @returns The next attempt time.
 */
export function nextAttemptAt(attempts: number, now: Date): Date {
  const index = Math.min(attempts, EMAIL_RETRY_MINUTES.length) - 1
  const minutes = EMAIL_RETRY_MINUTES[Math.max(0, index)]
  return new Date(now.getTime() + minutes * 60_000)
}

/**
 * Error code safe to store and log: never the message, which may carry
 * the recipient or server details (RNF05).
 *
 * @param error - Caught error.
 * @returns A short code.
 */
function errorCode(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return (typeof code === "string" ? code : error.name).slice(0, 120)
  }
  return "unknown"
}

/**
 * Puts an e-mail in the queue (`email_outbox`). Pass the transaction of
 * the event (order status change, sign-up) so the e-mail exists if and
 * only if the event was saved; the background job delivers it.
 *
 * @param client - Prisma client or transaction.
 * @param message - The e-mail.
 * @param now - When it may be sent (defaults to now).
 * @returns The queue id.
 */
export async function enqueueEmail(
  client: Pick<Prisma.TransactionClient, "emailOutbox">,
  message: EmailMessage,
  now: Date = new Date()
): Promise<string> {
  const row = await client.emailOutbox.create({
    data: {
      template: message.template ?? "generic",
      recipient: message.to,
      subject: message.subject.slice(0, 255),
      text: message.text,
      html: message.html ?? textToEmailHtml(message.text, message.subject),
      nextAttemptAt: now,
    },
    select: { id: true },
  })
  return row.id
}

/**
 * Tries to deliver one queued e-mail. The attempt is claimed first
 * (attempt counter and next attempt time move forward atomically), so
 * two workers never send the same e-mail and a crash in the middle
 * only delays it until the next attempt time. On failure the e-mail
 * waits for the next retry or, after MAX_EMAIL_ATTEMPTS, is marked as
 * failed.
 *
 * @param id - Queue id.
 * @param options - Transport and reference time (tests pass their own).
 * @returns The outcome.
 */
export async function deliverQueuedEmail(
  id: string,
  options: { transport?: EmailTransport; now?: Date } = {}
): Promise<"sent" | "retry" | "failed" | "skipped"> {
  const now = options.now ?? new Date()
  const row = await prisma.emailOutbox.findUnique({ where: { id } })
  if (!row || row.status !== "PENDING" || row.nextAttemptAt > now) {
    return "skipped"
  }
  const attempts = row.attempts + 1
  const claimed = await prisma.emailOutbox.updateMany({
    where: { id, status: "PENDING", attempts: row.attempts },
    data: { attempts, nextAttemptAt: nextAttemptAt(attempts, now) },
  })
  if (claimed.count !== 1) return "skipped"

  const transport = options.transport ?? getEmailTransport()
  try {
    await transport.send({
      id: row.id,
      to: row.recipient,
      subject: row.subject,
      text: row.text,
      html: row.html,
    })
    await prisma.emailOutbox.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), lastError: null },
    })
    logger.info("email sent", {
      messageId: id,
      template: row.template,
      transport: transport.name,
    })
    return "sent"
  } catch (error) {
    const failed = attempts >= MAX_EMAIL_ATTEMPTS
    const code = errorCode(error)
    await prisma.emailOutbox.update({
      where: { id },
      data: { status: failed ? "FAILED" : "PENDING", lastError: code },
    })
    logger.warn("email delivery failed", {
      messageId: id,
      template: row.template,
      attempts,
      error: code,
      final: failed,
    })
    return failed ? "failed" : "retry"
  }
}

/**
 * Delivers the queued e-mails that are due (RF53: queue with retries).
 * Run by the background job every few seconds.
 *
 * @param options - Transport, reference time and batch size.
 * @returns How many were sent, will be retried and failed for good.
 */
export async function processEmailQueue(
  options: { transport?: EmailTransport; now?: Date; limit?: number } = {}
): Promise<{ sent: number; retry: number; failed: number }> {
  const now = options.now ?? new Date()
  const due = await prisma.emailOutbox.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: now } },
    orderBy: { nextAttemptAt: "asc" },
    take: options.limit ?? QUEUE_BATCH,
    select: { id: true },
  })
  const result = { sent: 0, retry: 0, failed: 0 }
  const transport = options.transport ?? getEmailTransport()
  for (const { id } of due) {
    const outcome = await deliverQueuedEmail(id, { transport, now })
    if (outcome !== "skipped") result[outcome] += 1
  }
  return result
}

/**
 * Sends a transactional e-mail outside a transaction (password reset,
 * invitation, manual shipping quote): queues it and tries to deliver it
 * right away. A failed delivery stays in the queue for the retries and
 * never reaches the caller. The log never includes the recipient or
 * the body.
 *
 * @param message - The e-mail.
 * @returns The queue id.
 */
export async function sendEmail(message: EmailMessage): Promise<string> {
  const now = new Date()
  const id = await enqueueEmail(prisma, message, now)
  try {
    await deliverQueuedEmail(id, { now })
  } catch (error) {
    logger.error("email delivery crashed", {
      messageId: id,
      error: errorCode(error),
    })
  }
  return id
}
