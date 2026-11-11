import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { orderFixtures } from "./order-fixtures"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const {
  deliverQueuedEmail,
  enqueueEmail,
  MAX_EMAIL_ATTEMPTS,
  processEmailQueue,
  sendEmail,
} = await import("@/features/shared/lib/email/mailer")
const { transitionOrder } =
  await import("@/features/shared/lib/orders/order-lifecycle")

const fixtures = orderFixtures(prisma)
const queued: string[] = []

/**
 * Queue rows of an order e-mail, by template and recipient.
 *
 * @param since - Only rows created after this time.
 * @param subjectPart - Text in the subject (the order number).
 * @returns Template and recipient of each row.
 */
async function emailsFor(since: Date, subjectPart: string) {
  const rows = await prisma.emailOutbox.findMany({
    where: { createdAt: { gte: since }, subject: { contains: subjectPart } },
    orderBy: { createdAt: "asc" },
    select: { id: true, template: true, recipient: true },
  })
  queued.push(...rows.map((row) => row.id))
  return rows.map(({ template, recipient }) => ({ template, recipient }))
}

/** A transport that fails a given number of times, then sends. */
function flakyTransport(failures: number) {
  const sent: string[] = []
  let calls = 0
  return {
    sent,
    transport: {
      name: "test",
      send: async (message: { id: string }) => {
        calls += 1
        if (calls <= failures) {
          throw Object.assign(new Error("connection refused"), {
            code: "ECONNREFUSED",
          })
        }
        sent.push(message.id)
      },
    },
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "log").mockImplementation(() => {})
})

afterAll(async () => {
  await prisma.emailOutbox.deleteMany({ where: { id: { in: queued } } })
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("order e-mails on each event (#67, RF53)", () => {
  it("queues the customer e-mail of each status in the same transaction", async () => {
    const since = new Date(Date.now() - 1000)
    const sku = await fixtures.createSku(5)
    const order = await fixtures.createOrder({
      email: "cliente.pf@atelierbureau.test",
      sku,
    })
    for (const to of [
      "PAID",
      "SEPARATING",
      "INVOICED",
      "SHIPPED",
      "DELIVERED",
    ] as const) {
      await prisma.$transaction((tx) =>
        transitionOrder(tx, { orderId: order.id, to, changedById: null })
      )
    }
    expect(await emailsFor(since, order.number)).toEqual(
      ["order.paid", "order.invoiced", "order.shipped", "order.delivered"].map(
        (template) => ({
          template,
          recipient: "cliente.pf@atelierbureau.test",
        })
      )
    )
  })

  it("sends nothing when the status change is rolled back", async () => {
    const since = new Date(Date.now() - 1000)
    const sku = await fixtures.createSku(1)
    const order = await fixtures.createOrder({
      email: "cliente.pf@atelierbureau.test",
      sku,
    })
    await expect(
      prisma.$transaction(async (tx) => {
        await transitionOrder(tx, {
          orderId: order.id,
          to: "CANCELED",
          changedById: null,
        })
        throw new Error("rollback")
      })
    ).rejects.toThrow("rollback")
    expect(await emailsFor(since, order.number)).toEqual([])
  })

  it("asks the company approvers, not the requester, to approve (RN01)", async () => {
    const since = new Date(Date.now() - 1000)
    const sku = await fixtures.createSku(1)
    const order = await fixtures.createOrder({
      email: "solicitante@empresa-ficticia.test",
      organizationSlug: "empresa-ficticia",
      status: "AWAITING_SHIPPING_QUOTE",
      sku,
    })
    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId: order.id,
        to: "AWAITING_APPROVAL",
        changedById: null,
      })
    )
    expect(await emailsFor(since, order.number)).toEqual([
      {
        template: "order.approval_pending",
        recipient: "aprovador@empresa-ficticia.test",
      },
    ])
  })
})

describe("e-mail queue with retries (#67, RF53)", () => {
  it("retries a failed delivery later and then sends it", async () => {
    const now = new Date()
    const id = await enqueueEmail(
      prisma,
      {
        to: "cliente.pf@atelierbureau.test",
        subject: "Teste de fila",
        text: "Mensagem fictícia.",
        template: "test.queue",
      },
      now
    )
    queued.push(id)
    const flaky = flakyTransport(1)

    expect(
      await deliverQueuedEmail(id, { transport: flaky.transport, now })
    ).toBe("retry")
    const waiting = await prisma.emailOutbox.findUniqueOrThrow({
      where: { id },
    })
    expect(waiting).toMatchObject({
      status: "PENDING",
      attempts: 1,
      lastError: "ECONNREFUSED",
    })
    expect(waiting.nextAttemptAt.getTime()).toBe(now.getTime() + 60_000)
    // Not due yet: nothing happens
    expect(
      await deliverQueuedEmail(id, { transport: flaky.transport, now })
    ).toBe("skipped")

    const later = new Date(now.getTime() + 61_000)
    await processEmailQueue({ transport: flaky.transport, now: later })
    expect(flaky.sent).toContain(id)
    expect(
      await prisma.emailOutbox.findUniqueOrThrow({
        where: { id },
        select: { status: true, attempts: true, lastError: true },
      })
    ).toEqual({ status: "SENT", attempts: 2, lastError: null })
  })

  it("gives up after the maximum attempts", async () => {
    let now = new Date()
    const id = await enqueueEmail(
      prisma,
      {
        to: "cliente.pf@atelierbureau.test",
        subject: "Teste de falha",
        text: "Mensagem fictícia.",
      },
      now
    )
    queued.push(id)
    const broken = flakyTransport(Number.POSITIVE_INFINITY)
    const outcomes: string[] = []
    for (let i = 0; i < MAX_EMAIL_ATTEMPTS; i++) {
      outcomes.push(
        await deliverQueuedEmail(id, { transport: broken.transport, now })
      )
      now = new Date(now.getTime() + 61 * 60_000)
    }
    expect(outcomes).toEqual(["retry", "retry", "retry", "retry", "failed"])
    expect(
      await prisma.emailOutbox.findUniqueOrThrow({
        where: { id },
        select: { status: true, attempts: true },
      })
    ).toEqual({ status: "FAILED", attempts: MAX_EMAIL_ATTEMPTS })
  })

  it("sends direct e-mails right away in the brand layout", async () => {
    const id = await sendEmail({
      to: "cliente.pf@atelierbureau.test",
      subject: "Redefinição de senha — Atelier Bureau",
      text: "Olá.\n\nUse este link: http://localhost:3000/redefinir-senha",
    })
    queued.push(id)
    const row = await prisma.emailOutbox.findUniqueOrThrow({
      where: { id },
      select: { status: true, html: true, template: true },
    })
    expect(row.status).toBe("SENT")
    expect(row.template).toBe("generic")
    expect(row.html).toContain('<html lang="pt-BR">')
  })
})
