import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { randomUUID } from "node:crypto"
import { resetInternalTwoFactor, signInSeedAccount } from "./internal-sign-in"
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

// The per-user refund limit (#175) is covered by its own tests
vi.mock(
  "@/features/shared/lib/rate-limit/persistent-limit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    enforcePersistentRateLimits: vi.fn(async () => undefined),
  })
)

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { approveRefund, rejectRefund, requestRefund, retryRefund } =
  await import("@/features/finance/refunds/action/refund-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const finance = "financeiro@atelierbureau.test"
const customer = "cliente.pf@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const organizationSlug = "empresa-ficticia"
const DAY_MS = 24 * 60 * 60 * 1000

/** What the fake Mercado Pago answers to the next refund. */
let mercadoPago: { kind: "answer"; status: string } | { kind: "timeout" } = {
  kind: "answer",
  status: "approved",
}
/** Refund calls received by the fake Mercado Pago. */
let refundCalls: Array<{
  url: string
  amount: number
  idempotencyKey: string
}> = []
let nextRefundId = 0

/**
 * Fake Mercado Pago sandbox for `POST /v1/payments/{id}/refunds`: it
 * echoes the amount and follows `mercadoPago`.
 */
function stubMercadoPago() {
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-0000")
  vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "TEST-public-0000")
  vi.stubEnv("MERCADOPAGO_BASE_URL", "https://mp.test")
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (!url.startsWith("https://mp.test") || !url.endsWith("/refunds")) {
        return new Response("{}", { status: 404 })
      }
      const body = JSON.parse(String(init?.body ?? "{}"))
      const headers = init?.headers as Record<string, string>
      refundCalls.push({
        url,
        amount: body.amount,
        idempotencyKey: headers["X-Idempotency-Key"],
      })
      if (mercadoPago.kind === "timeout") {
        throw new DOMException("timeout", "TimeoutError")
      }
      nextRefundId += 1
      return new Response(
        JSON.stringify({
          id: `${Date.now()}${nextRefundId}`,
          amount: body.amount,
          status: mercadoPago.status,
        }),
        { status: 201 }
      )
    })
  )
}

/**
 * Creates an order paid through Mercado Pago (R$ 100,00) with its
 * approved payment.
 *
 * @param input - Customer, status, company and payment approval date.
 * @returns The order and the payment row.
 */
async function paidOrder(
  input: {
    email?: string
    status?: "PAID" | "CANCELED" | "INVOICED"
    organizationSlug?: string
    paidAt?: Date
  } = {}
) {
  const sku = await fixtures.createSku(5)
  const order = await fixtures.createOrder({
    email: input.email ?? customer,
    organizationSlug: input.organizationSlug,
    status: "PAID",
    paymentMethod: "PIX",
    sku,
  })
  if (input.status && input.status !== "PAID") {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: input.status },
    })
  }
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      method: "PIX",
      status: "APPROVED",
      paymentId: `9${Date.now()}${Math.floor(Math.random() * 1000)}`,
      providerStatus: "approved",
      amount: "100.00",
      paidAt: input.paidAt ?? new Date(),
    },
    select: { id: true, paymentId: true },
  })
  return { order, payment }
}

/**
 * Creates a corporate invoiced order (R$ 100,00) with its two
 * installments, the first one already settled.
 *
 * @returns The order and the installments.
 */
async function invoicedOrder() {
  const sku = await fixtures.createSku(5)
  const order = await fixtures.createOrder({
    email: requester,
    organizationSlug,
    status: "PAID",
    paymentMethod: "INVOICED",
    sku,
  })
  const tag = randomUUID().replace(/\D/g, "").padEnd(12, "0").slice(0, 12)
  const now = new Date()
  for (const sequence of [1, 2]) {
    await prisma.receivable.create({
      data: {
        orderId: order.id,
        sequence,
        dueDays: sequence * 28,
        amount: "50.00",
        dueDate: new Date(now.getTime() + sequence * 28 * DAY_MS),
        status: sequence === 1 ? "PAID" : "OPEN",
        paidAt: sequence === 1 ? now : null,
        paidAmount: sequence === 1 ? "50.00" : null,
        settlementMethod: sequence === 1 ? "MANUAL" : null,
        boletoNumber: `T${tag}${sequence}`,
        digitableLine: `00000000000000000000000000000000000000000000${sequence}`,
      },
    })
  }
  return { order }
}

/**
 * Id of a seed user.
 *
 * @param email - Seed account e-mail.
 * @returns The user id.
 */
async function userId(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  })
  return user.id
}

/**
 * Status of an order.
 *
 * @param orderId - Order id.
 * @returns The status.
 */
async function orderStatus(orderId: string) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true },
  })
  return order.status
}

/**
 * Audit actions written for a refund, oldest first.
 *
 * @param refundId - Refund id.
 * @returns The action names.
 */
async function auditActions(refundId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "refund", entityId: refundId },
    orderBy: { createdAt: "asc" },
    select: { action: true },
  })
  return rows.map((row) => row.action)
}

beforeEach(async () => {
  mercadoPago = { kind: "answer", status: "approved" }
  refundCalls = []
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  stubMercadoPago()
  await signInSeedAccount(finance, password)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await fixtures.cleanup()
  await resetInternalTwoFactor()
  await prisma.$disconnect()
})

describe("refunds through Mercado Pago (#59, RF34, RNF07)", () => {
  it("completes a full refund, refunds the order and writes the audit log", async () => {
    const { order, payment } = await paidOrder({ status: "CANCELED" })
    const financeId = await userId(finance)

    const result = await requestRefund({
      orderId: order.id,
      reason: "CANCELLATION",
      kind: "FULL",
      note: "Pedido cancelado a pedido do cliente (teste).",
    })
    if (!result.success) throw new Error(result.error)
    expect(result.status).toBe("COMPLETED")

    expect(refundCalls).toHaveLength(1)
    expect(refundCalls[0]).toEqual({
      url: `https://mp.test/v1/payments/${payment.paymentId}/refunds`,
      amount: 100,
      idempotencyKey: result.refundId,
    })

    const refund = await prisma.refund.findUniqueOrThrow({
      where: { id: result.refundId },
      select: {
        status: true,
        kind: true,
        channel: true,
        amount: true,
        providerRefundId: true,
        completedAt: true,
        requestedById: true,
        paymentRowId: true,
      },
    })
    expect(refund).toMatchObject({
      status: "COMPLETED",
      kind: "FULL",
      channel: "MERCADO_PAGO",
      requestedById: financeId,
      paymentRowId: payment.id,
    })
    expect(refund.amount.toFixed(2)).toBe("100.00")
    expect(refund.providerRefundId).not.toBeNull()
    expect(refund.completedAt).not.toBeNull()

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true, refundedAmount: true },
    })
    expect(stored.status).toBe("REFUNDED")
    expect(stored.refundedAmount.toFixed(2)).toBe("100.00")
    expect(await orderStatus(order.id)).toBe("REFUNDED")
    expect(
      await prisma.orderStatusHistory.findFirst({
        where: { orderId: order.id, toStatus: "REFUNDED" },
        select: { fromStatus: true, changedById: true },
      })
    ).toEqual({ fromStatus: "CANCELED", changedById: financeId })
    expect(await auditActions(result.refundId)).toEqual([
      "refund.request",
      "refund.complete",
    ])
  })

  it("completes a partial refund and keeps the order open", async () => {
    const { order, payment } = await paidOrder()

    const result = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "30,00",
      note: "Diferença de frete devolvida ao cliente (teste).",
    })
    if (!result.success) throw new Error(result.error)
    expect(result.status).toBe("COMPLETED")
    expect(refundCalls.map((call) => call.amount)).toEqual([30])

    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true, refundedAmount: true },
    })
    expect(stored.status).toBe("PARTIALLY_REFUNDED")
    expect(stored.refundedAmount.toFixed(2)).toBe("30.00")
    expect(await orderStatus(order.id)).toBe("PAID")
    expect(await auditActions(result.refundId)).toEqual([
      "refund.request",
      "refund.complete",
    ])

    // A second partial refund cannot take the whole remaining amount
    expect(
      await requestRefund({
        orderId: order.id,
        reason: "ADJUSTMENT",
        kind: "PARTIAL",
        amount: "70.00",
        note: "Tentativa de devolver o restante como parcial.",
      })
    ).toEqual({
      success: false,
      error:
        "O estorno parcial deve ser menor que o valor disponível (R$ 70,00). Para devolver tudo, escolha estorno total.",
    })
  })

  it("refuses a refund after the Mercado Pago deadline (RN18)", async () => {
    const setting = await prisma.setting.findUniqueOrThrow({
      where: { key: "refund.max_days_after_payment" },
      select: { value: true },
    })
    const maxDays = Number(setting.value)
    const { order } = await paidOrder({
      paidAt: new Date(Date.now() - (maxDays + 2) * DAY_MS),
    })

    expect(
      await requestRefund({
        orderId: order.id,
        reason: "ADJUSTMENT",
        kind: "PARTIAL",
        amount: "10.00",
        note: "Ajuste pedido depois do prazo (teste).",
      })
    ).toEqual({
      success: false,
      error: `O prazo de ${maxDays} dias do Mercado Pago para estornar este pagamento terminou (RN18).`,
    })
    expect(refundCalls).toHaveLength(0)
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0)
  })

  it("keeps a refund processing when Mercado Pago does not answer and completes it on retry", async () => {
    const { order, payment } = await paidOrder()
    mercadoPago = { kind: "timeout" }

    const first = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "20.00",
      note: "Ajuste de preço combinado com o cliente (teste).",
    })
    if (!first.success) throw new Error(first.error)
    expect(first.status).toBe("PROCESSING")
    expect(
      await prisma.payment.findUniqueOrThrow({
        where: { id: payment.id },
        select: { status: true },
      })
    ).toEqual({ status: "APPROVED" })

    mercadoPago = { kind: "answer", status: "approved" }
    const retried = await retryRefund({ refundId: first.refundId })
    if (!retried.success) throw new Error(retried.error)
    expect(retried.status).toBe("COMPLETED")
    // Same idempotency key on both calls: never refunded twice
    expect(refundCalls.map((call) => call.idempotencyKey)).toEqual([
      first.refundId,
      first.refundId,
    ])
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { status: true, refundedAmount: true },
    })
    expect(stored.status).toBe("PARTIALLY_REFUNDED")
    expect(stored.refundedAmount.toFixed(2)).toBe("20.00")
  })
})

describe("refunds that need the finance approval (RN07)", () => {
  it("waits for approval after the NF-e of a corporate order and completes when approved", async () => {
    const { order, payment } = await paidOrder({
      email: requester,
      organizationSlug,
      status: "INVOICED",
    })
    const financeId = await userId(finance)

    const requested = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "25.00",
      note: "Desconto comercial concedido após a NF-e (teste).",
    })
    if (!requested.success) throw new Error(requested.error)
    expect(requested.status).toBe("PENDING_APPROVAL")
    expect(refundCalls).toHaveLength(0)

    const approved = await approveRefund({
      refundId: requested.refundId,
      note: "Aprovado pelo financeiro.",
    })
    if (!approved.success) throw new Error(approved.error)
    expect(approved.status).toBe("COMPLETED")
    expect(refundCalls.map((call) => call.amount)).toEqual([25])

    const refund = await prisma.refund.findUniqueOrThrow({
      where: { id: requested.refundId },
      select: {
        status: true,
        decidedById: true,
        decidedAt: true,
        decisionNote: true,
      },
    })
    expect(refund).toMatchObject({
      status: "COMPLETED",
      decidedById: financeId,
      decisionNote: "Aprovado pelo financeiro.",
    })
    expect(refund.decidedAt).not.toBeNull()
    const stored = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      select: { refundedAmount: true },
    })
    expect(stored.refundedAmount.toFixed(2)).toBe("25.00")
    expect(await orderStatus(order.id)).toBe("INVOICED")
    expect(await auditActions(requested.refundId)).toEqual([
      "refund.request",
      "refund.approve",
      "refund.complete",
    ])
  })

  it("refuses a corporate invoiced refund with the reason and lets a new one be approved", async () => {
    const { order } = await invoicedOrder()
    const financeId = await userId(finance)

    const requested = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "50.00",
      note: "Empresa pediu a devolução da primeira parcela (teste).",
    })
    if (!requested.success) throw new Error(requested.error)
    expect(requested.status).toBe("PENDING_APPROVAL")

    // Only one refund at a time while it waits
    expect(
      await requestRefund({
        orderId: order.id,
        reason: "ADJUSTMENT",
        kind: "PARTIAL",
        amount: "10.00",
        note: "Segundo pedido de estorno em paralelo.",
      })
    ).toEqual({
      success: false,
      error:
        "Já existe um estorno deste pedido aguardando aprovação ou em processamento.",
    })

    expect(
      await rejectRefund({ refundId: requested.refundId, note: "Sem" })
    ).toEqual({ success: false, error: "Informe o motivo da recusa." })
    expect(
      await rejectRefund({
        refundId: requested.refundId,
        note: "Parcela ainda em conciliação bancária.",
      })
    ).toEqual({ success: true })
    expect(
      await prisma.refund.findUniqueOrThrow({
        where: { id: requested.refundId },
        select: { status: true, decidedById: true, decisionNote: true },
      })
    ).toEqual({
      status: "REJECTED",
      decidedById: financeId,
      decisionNote: "Parcela ainda em conciliação bancária.",
    })
    expect(await auditActions(requested.refundId)).toEqual([
      "refund.request",
      "refund.reject",
    ])
    // A refused refund cannot be approved afterwards
    expect(await approveRefund({ refundId: requested.refundId })).toEqual({
      success: false,
      error: "Este estorno não aguarda aprovação. Atualize a página.",
    })

    // A new full request returns what was received (the settled
    // installment) by bank transfer and closes the order
    const again = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "50.00",
      note: "Devolução da parcela paga após conciliação (teste).",
    })
    if (!again.success) throw new Error(again.error)
    expect(again.status).toBe("PENDING_APPROVAL")
    const approved = await approveRefund({ refundId: again.refundId })
    if (!approved.success) throw new Error(approved.error)
    expect(approved.status).toBe("COMPLETED")
    expect(refundCalls).toHaveLength(0)
    expect(
      await prisma.refund.findUniqueOrThrow({
        where: { id: again.refundId },
        select: { status: true, channel: true, paymentRowId: true },
      })
    ).toEqual({
      status: "COMPLETED",
      channel: "MANUAL_TRANSFER",
      paymentRowId: null,
    })
  })

  it("refunds an invoiced order in full and cancels its open installments", async () => {
    const { order } = await invoicedOrder()

    const requested = await requestRefund({
      orderId: order.id,
      reason: "ADJUSTMENT",
      kind: "PARTIAL",
      amount: "50.00",
      note: "Devolução integral do valor recebido (teste).",
    })
    if (!requested.success) throw new Error(requested.error)
    expect(requested.status).toBe("PENDING_APPROVAL")
    expect(
      await rejectRefund({
        refundId: requested.refundId,
        note: "Refazer como estorno total.",
      })
    ).toEqual({ success: true })

    await prisma.order.update({
      where: { id: order.id },
      data: { status: "CANCELED" },
    })
    const total = await requestRefund({
      orderId: order.id,
      reason: "CANCELLATION",
      kind: "FULL",
      note: "Pedido faturado cancelado pela empresa (teste).",
    })
    if (!total.success) throw new Error(total.error)
    expect(total.status).toBe("PENDING_APPROVAL")
    const approved = await approveRefund({ refundId: total.refundId })
    if (!approved.success) throw new Error(approved.error)
    expect(approved.status).toBe("COMPLETED")

    const refund = await prisma.refund.findUniqueOrThrow({
      where: { id: total.refundId },
      select: { amount: true, channel: true },
    })
    expect(refund.amount.toFixed(2)).toBe("50.00")
    expect(refund.channel).toBe("MANUAL_TRANSFER")
    expect(await orderStatus(order.id)).toBe("REFUNDED")
    expect(
      await prisma.receivable.findMany({
        where: { orderId: order.id },
        orderBy: { sequence: "asc" },
        select: { status: true },
      })
    ).toEqual([{ status: "PAID" }, { status: "CANCELED" }])
  })
})
