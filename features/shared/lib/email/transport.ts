import "server-only"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import nodemailer from "nodemailer"

/** A message handed to the transport. */
export type OutgoingEmail = {
  /** Queue id, used as file name and Message-ID seed. */
  id: string
  /** Recipient. */
  to: string
  /** Subject. */
  subject: string
  /** Plain text body. */
  text: string
  /** HTML body. */
  html: string
}

/** Delivers one e-mail or throws. */
export type EmailTransport = {
  /** Transport name for the logs ("smtp" or "file"). */
  name: string
  /**
   * Sends the message.
   *
   * @param message - The e-mail.
   */
  send: (message: OutgoingEmail) => Promise<void>
}

/** Folder where e-mails are written when SMTP is not configured. */
const OUTBOX_DIR = join(process.cwd(), "storage", "outbox")

/** Sender used when EMAIL_FROM is not set (fictitious domain). */
const DEFAULT_FROM = "Atelier Bureau <nao-responda@atelierbureau.test>"

/**
 * Development transport: writes each e-mail as JSON to
 * `storage/outbox`, so links (password reset, invitations) can be
 * opened without an SMTP server.
 *
 * @returns The transport.
 */
export function fileTransport(): EmailTransport {
  return {
    name: "file",
    send: async (message) => {
      await mkdir(OUTBOX_DIR, { recursive: true })
      await writeFile(
        join(OUTBOX_DIR, `${message.id}.json`),
        JSON.stringify(message, null, 2),
        "utf8"
      )
    },
  }
}

/**
 * SMTP transport (RF53) configured by environment variables:
 * `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE` ("true" for
 * implicit TLS), `SMTP_USER`, `SMTP_PASSWORD` and `EMAIL_FROM`. Every
 * connection has a timeout, so a slow server never holds the queue.
 *
 * @param env - Environment (tests pass their own).
 * @returns The transport.
 */
export function smtpTransport(
  env: NodeJS.ProcessEnv = process.env
): EmailTransport {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === "true",
    auth: env.SMTP_USER
      ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD ?? "" }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  const from = env.EMAIL_FROM || DEFAULT_FROM
  return {
    name: "smtp",
    send: async (message) => {
      await transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    },
  }
}

/**
 * Transport of the environment: SMTP when `SMTP_HOST` is set,
 * otherwise the development file outbox.
 *
 * @returns The transport.
 */
export function getEmailTransport(): EmailTransport {
  return process.env.SMTP_HOST ? smtpTransport() : fileTransport()
}
