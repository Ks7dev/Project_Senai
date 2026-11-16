import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { invoiceIssuedEmail, nfeFailureAlertEmail } from "@/emails/templates"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { prisma } from "@/features/shared/lib/db/prisma"
import { enqueueEmail } from "@/features/shared/lib/email/mailer"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  downloadNfeFile,
  getNfe,
  NfeError,
  submitNfe,
} from "@/features/shared/lib/nfe/nfe-client"
import {
  buildNfePayload,
  nfeDefaultsSchema,
  nfeIssuerSchema,
  NfePayloadError,
} from "@/features/shared/lib/nfe/nfe-payload"
import { getSetting } from "@/features/shared/lib/settings/settings"
import { saveFile } from "@/features/shared/lib/storage/storage"
import { decryptPersonal } from "@/features/shared/lib/crypto/personal-data-cipher"

/** Status of an NF-e in the store. */
export type InvoiceStatusKey = "PENDING" | "PROCESSING" | "ISSUED" | "FAILED"

/** Minutes before each automatic new attempt after a failure. */
export const NFE_RETRY_MINUTES = [1, 5, 15, 60, 240] as const

/** Automatic attempts before the NF-e waits for a manual reprocess. */
export const NFE_MAX_AUTOMATIC_ATTEMPTS = NFE_RETRY_MINUTES.length + 1

/** Interval to ask the provider again while SEFAZ processes the NF-e. */
const POLL_MS = 60_000

/** Time a run holds the NF-e, so two runs never send it together. */
const LEASE_MS = 2 * 60_000

/** How many NF-e the job handles per run. */
const BATCH_SIZE = 10

/** Outcome of an NF-e run. */
export type InvoiceRunOutcome = {
  /** Status after the run. */
  status: InvoiceStatusKey
  /** What happened, in Portuguese. */
  message: string
}

/**
 * Queues the NF-e of an order that was just confirmed (RF13, RN13):
 * creates its row, pending, in the transaction that confirms the order,
 * so the job issues it right after. Does nothing when the order already
 * has one (idempotent).
 *
 * @param tx - Prisma transaction of the confirmation.
 * @param input - Order and the confirmation time.
 */
export async function queueInvoiceIssuance(
  tx: Prisma.TransactionClient,
  input: { orderId: string; now: Date }
): Promise<void> {
  await tx.invoice.upsert({
    where: { orderId: input.orderId },
    create: {
      orderId: input.orderId,
      status: "PENDING",
      nextAttemptAt: input.now,
      createdAt: input.now,
    },
    update: {},
  })
}

/**
 * When the job tries again after a failure.
 *
 * @param attempts - Failed attempts so far, this one included.
 * @param now - Reference time.
 * @returns The time, or null when only a manual reprocess remains.
 */
export function nextRetryAt(attempts: number, now: Date): Date | null {
  if (attempts >= NFE_MAX_AUTOMATIC_ATTEMPTS) return null
  const minutes = NFE_RETRY_MINUTES[Math.max(attempts, 1) - 1]
  return new Date(now.getTime() + minutes * 60_000)
}

/**
 * Back office users who manage the NF-e (`invoice:manage`), alerted of
 * a failure.
 *
 * @param tx - Prisma transaction.
 * @returns Name and e-mail of each one.
 */
async function invoiceManagers(
  tx: Prisma.TransactionClient
): Promise<Array<{ name: string; email: string }>> {
  return tx.user.findMany({
    where: {
      deletedAt: null,
      userRoles: {
        some: {
          role: {
            rolePermissions: {
              some: { permission: { resource: "invoice", action: "manage" } },
            },
          },
        },
      },
    },
    select: { name: true, email: true },
    take: 20,
  })
}

/**
 * Records a failed run: counts the attempt, schedules the automatic new
 * attempt (when it makes sense) and, the first time it fails or when
 * the automatic attempts end, alerts the team by log and e-mail.
 * Audited (RNF12).
 *
 * @param input - NF-e, failure, whether to retry, whether to send it
 * again, the user (null = job) and the time.
 * @returns The outcome.
 */
async function failInvoice(input: {
  invoice: {
    id: string
    orderId: string
    attempts: number
    alertedAt: Date | null
    orderNumber: string
  }
  message: string
  retryable: boolean
  resubmit: boolean
  userId: string | null
  now: Date
}): Promise<InvoiceRunOutcome> {
  const attempts = input.invoice.attempts + 1
  const nextAttemptAt = input.retryable
    ? nextRetryAt(attempts, input.now)
    : null
  const alert = !input.invoice.alertedAt || nextAttemptAt === null
  await prisma.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id: input.invoice.id },
      data: {
        status: "FAILED",
        attempts,
        lastError: input.message.slice(0, 500),
        nextAttemptAt,
        ...(input.resubmit ? { submittedAt: null } : {}),
        ...(alert ? { alertedAt: input.now } : {}),
      },
    })
    await writeAudit(tx, {
      userId: input.userId,
      action: "invoice.fail",
      entity: "invoice",
      entityId: input.invoice.id,
      after: {
        orderId: input.invoice.orderId,
        attempts,
        error: input.message,
        nextAttemptAt,
      },
    })
    if (!alert) return
    logger.error("nfe issuance failed", {
      invoiceId: input.invoice.id,
      orderId: input.invoice.orderId,
      attempts,
      automaticRetry: nextAttemptAt !== null,
    })
    for (const manager of await invoiceManagers(tx)) {
      await enqueueEmail(tx, {
        to: manager.email,
        ...nfeFailureAlertEmail({
          name: manager.name,
          number: input.invoice.orderNumber,
          error: input.message,
          automaticRetry: nextAttemptAt !== null,
          url: `${siteUrl()}/admin/nfe?filtro=FAILED`,
        }),
      })
    }
  })
  return {
    status: "FAILED",
    message: `A NF-e não foi emitida: ${input.message}`,
  }
}

/**
 * Queues the "nota fiscal emitida" e-mail to the customer in the
 * transaction that stores the authorized NF-e (RF53: NF-e), with the
 * access key, so it goes out only if the NF-e is saved.
 *
 * @param tx - Prisma transaction of the issuance.
 * @param input - Order and access key of the NF-e.
 */
async function enqueueInvoiceIssuedEmail(
  tx: Prisma.TransactionClient,
  input: { orderId: string; accessKey: string }
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: input.orderId },
    select: {
      number: true,
      total: true,
      user: { select: { name: true, email: true } },
    },
  })
  if (!order) return
  await enqueueEmail(tx, {
    to: order.user.email,
    ...invoiceIssuedEmail({
      name: order.user.name,
      number: order.number,
      total: order.total.toFixed(2),
      url: `${siteUrl()}/conta/pedidos`,
      accessKey: input.accessKey,
    }),
  })
}

/**
 * Builds the NF-e payload of an order from the settings table.
 *
 * @param order - Order data.
 * @param now - Issue date.
 * @returns The payload.
 * @throws NfePayloadError or Error (invalid settings).
 */
async function payloadFor(
  order: {
    number: string
    shippingAddress: unknown
    shippingTotal: { toFixed: (digits: number) => string }
    discount: { toFixed: (digits: number) => string }
    servicesTotal: { toFixed: (digits: number) => string }
    user: { document: string }
    organization: { cnpj: string | null } | null
    items: Array<{
      skuCode: string
      productName: string
      quantity: number
      unitPrice: { toFixed: (digits: number) => string }
    }>
  },
  now: Date
): Promise<Record<string, unknown>> {
  const issuer = nfeIssuerSchema.safeParse(await getSetting("invoice.issuer"))
  const defaults = nfeDefaultsSchema.safeParse(
    await getSetting("invoice.nfe_defaults")
  )
  if (!issuer.success || !defaults.success) {
    throw new NfePayloadError(
      "Os dados fiscais do emitente nas configurações estão incompletos."
    )
  }
  return buildNfePayload(
    {
      number: order.number,
      document:
        order.organization?.cnpj ?? decryptPersonal(order.user.document),
      shippingAddress: order.shippingAddress,
      shippingTotal: order.shippingTotal.toFixed(2),
      discount: order.discount.toFixed(2),
      servicesTotal: order.servicesTotal.toFixed(2),
      items: order.items.map((item) => ({
        skuCode: item.skuCode,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
      })),
    },
    issuer.data,
    defaults.data,
    now
  )
}

/**
 * Runs one step of the NF-e of an order (RF13), outside any database
 * transaction:
 * 1. holds the NF-e for a short lease, so two runs never send it twice;
 * 2. not sent yet: builds the payload and sends it with our id as the
 *    reference (idempotent in the provider);
 * 3. already sent: asks the status; once authorized, downloads the XML
 *    and the DANFE and stores them with the access key on the order;
 * 4. a failure is recorded with an alert and an automatic new attempt
 *    when the provider was unavailable (`failInvoice`).
 *
 * @param invoiceId - NF-e id.
 * @param options - Time, user of a manual reprocess and fetch (tests).
 * @returns The outcome.
 */
export async function processInvoice(
  invoiceId: string,
  options: {
    now?: Date
    userId?: string | null
    manual?: boolean
    fetcher?: typeof fetch
  } = {}
): Promise<InvoiceRunOutcome> {
  const now = options.now ?? new Date()
  const fetcher = options.fetcher ?? fetch
  const userId = options.userId ?? null
  const claimed = await prisma.invoice.updateMany({
    where: {
      id: invoiceId,
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      ...(options.manual ? {} : { nextAttemptAt: { lte: now } }),
    },
    data: { nextAttemptAt: new Date(now.getTime() + LEASE_MS) },
  })
  if (claimed.count === 0) {
    return {
      status: "PROCESSING",
      message: "Esta NF-e já está sendo processada ou já foi emitida.",
    }
  }

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    select: {
      id: true,
      orderId: true,
      attempts: true,
      alertedAt: true,
      submittedAt: true,
      order: {
        select: {
          number: true,
          shippingAddress: true,
          shippingTotal: true,
          discount: true,
          servicesTotal: true,
          user: { select: { document: true } },
          organization: { select: { cnpj: true } },
          items: {
            orderBy: { id: "asc" },
            select: {
              skuCode: true,
              productName: true,
              quantity: true,
              unitPrice: true,
            },
          },
        },
      },
    },
  })
  const failure = {
    invoice: {
      id: invoice.id,
      orderId: invoice.orderId,
      attempts: invoice.attempts,
      alertedAt: invoice.alertedAt,
      orderNumber: invoice.order.number,
    },
    userId,
    now,
  }

  try {
    if (!invoice.submittedAt) {
      const payload = await payloadFor(invoice.order, now)
      try {
        await submitNfe(invoice.id, payload, fetcher)
      } catch (error) {
        // A repeated send may be refused because the NF-e already exists
        if (!(error instanceof NfeError) || error.kind !== "refused")
          throw error
        const existing = await getNfe(invoice.id, fetcher).catch(() => null)
        if (!existing) throw error
      }
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PROCESSING",
          submittedAt: now,
          nextAttemptAt: new Date(now.getTime() + POLL_MS),
        },
      })
      return {
        status: "PROCESSING",
        message: "NF-e enviada ao emissor. Aguardando a autorização da SEFAZ.",
      }
    }

    const result = await getNfe(invoice.id, fetcher)
    if (result.status === "processing") {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "PROCESSING",
          nextAttemptAt: new Date(now.getTime() + POLL_MS),
        },
      })
      return {
        status: "PROCESSING",
        message: "A SEFAZ ainda processa a NF-e.",
      }
    }
    if (result.status === "rejected") {
      return failInvoice({
        ...failure,
        message: result.message,
        retryable: false,
        resubmit: true,
      })
    }
    if (result.status === "canceled") {
      return failInvoice({
        ...failure,
        message: "A NF-e consta como cancelada no emissor.",
        retryable: false,
        resubmit: false,
      })
    }
    if (!result.xmlPath || !result.danfePath) {
      throw new NfeError("unavailable")
    }
    const [xml, danfe] = await Promise.all([
      downloadNfeFile(result.xmlPath, fetcher),
      downloadNfeFile(result.danfePath, fetcher),
    ])
    const danfeKey = `invoices/${invoice.orderId}/danfe-${result.accessKey}.pdf`
    await saveFile(danfeKey, danfe)
    await prisma.$transaction(async (tx) => {
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: "ISSUED",
          accessKey: result.accessKey,
          number: result.number,
          series: result.series,
          protocol: result.protocol,
          xml: xml.toString("utf8"),
          danfeKey,
          issuedAt: now,
          nextAttemptAt: null,
          lastError: null,
          alertedAt: null,
        },
      })
      await writeAudit(tx, {
        userId,
        action: "invoice.issue",
        entity: "invoice",
        entityId: invoice.id,
        after: {
          orderId: invoice.orderId,
          accessKey: result.accessKey,
          number: result.number,
          series: result.series,
        },
      })
      await enqueueInvoiceIssuedEmail(tx, {
        orderId: invoice.orderId,
        accessKey: result.accessKey,
      })
    })
    return {
      status: "ISSUED",
      message: `NF-e ${result.number ?? ""} emitida. Chave ${result.accessKey}.`,
    }
  } catch (error) {
    if (error instanceof NfePayloadError) {
      return failInvoice({
        ...failure,
        message: error.publicMessage,
        retryable: false,
        resubmit: false,
      })
    }
    if (error instanceof NfeError) {
      switch (error.kind) {
        case "not_configured":
          return failInvoice({
            ...failure,
            message: "O emissor de NF-e não está configurado neste ambiente.",
            retryable: true,
            resubmit: false,
          })
        case "not_found":
          return failInvoice({
            ...failure,
            message:
              "O emissor não encontrou a NF-e. Ela será enviada de novo.",
            retryable: true,
            resubmit: true,
          })
        case "refused":
          return failInvoice({
            ...failure,
            message: error.publicMessage ?? "O emissor recusou a NF-e.",
            retryable: false,
            resubmit: true,
          })
        default:
          return failInvoice({
            ...failure,
            message: "O emissor de NF-e não respondeu.",
            retryable: true,
            resubmit: false,
          })
      }
    }
    logger.error("nfe run failed", { invoiceId, error })
    return failInvoice({
      ...failure,
      message: "Erro inesperado ao emitir a NF-e.",
      retryable: true,
      resubmit: false,
    })
  }
}

/**
 * Background job: runs the NF-e whose time has come (new, in SEFAZ
 * processing or failed with an automatic new attempt), one at a time.
 *
 * @param now - Reference time.
 * @returns How many NF-e were handled.
 */
export async function processDueInvoices(
  now: Date = new Date()
): Promise<number> {
  const due = await prisma.invoice.findMany({
    where: {
      status: { in: ["PENDING", "PROCESSING", "FAILED"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: { nextAttemptAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  })
  for (const invoice of due) {
    await processInvoice(invoice.id, { now })
  }
  return due.length
}
