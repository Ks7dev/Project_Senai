import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { refundCompletedEmail } from "@/emails/templates"
import { refundRequestSchema } from "@/features/finance/refunds/schema/refund-schema"
import { MercadoPagoError } from "@/features/shared/lib/mercadopago/mercadopago"
import {
  decideRefund,
  paymentStatusAfterRefund,
  refundableCents,
  refundNeedsApproval,
  type RefundContext,
} from "@/features/shared/lib/refunds/refund-rules"

const requirePermission = vi.fn()
const transitionOrder = vi.fn()
const createMercadoPagoRefund = vi.fn()

/** Fake Prisma: the same object is the client and the transaction. */
const db = {
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  order: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  refund: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
  },
  payment: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  setting: { findUnique: vi.fn() },
  emailOutbox: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("@/features/shared/lib/db/permissions", () => ({
  requirePermission: (permission: string) => requirePermission(permission),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/orders/order-lifecycle", () => ({
  transitionOrder: (...args: unknown[]) => transitionOrder(...args),
}))
vi.mock(
  "@/features/shared/lib/mercadopago/mercadopago",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    createMercadoPagoRefund: (...args: unknown[]) =>
      createMercadoPagoRefund(...args),
  })
)

const { requestRefund, approveRefund, rejectRefund, retryRefund } =
  await import("@/features/finance/refunds/action/refund-actions")
const { createMercadoPagoRefund: realCreateRefund } = await vi.importActual<
  typeof import("@/features/shared/lib/mercadopago/mercadopago")
>("@/features/shared/lib/mercadopago/mercadopago")

const orderId = "019a7b1e-0000-7000-8000-000000000201"
const refundId = "019a7b1e-0000-7000-8000-000000000202"
const paymentRowId = "019a7b1e-0000-7000-8000-000000000203"
const now = new Date("2026-11-14T15:00:00.000Z")
const DAY = 24 * 60 * 60 * 1000
const settings = { withdrawalDays: 7, maxDaysAfterPayment: 180 }

/**
 * A Decimal-like value, as Prisma returns it.
 *
 * @param value - Decimal string.
 * @returns An object with `toFixed`.
 */
function decimal(value: string) {
  return {
    toFixed: () => Number(value).toFixed(2),
    valueOf: () => Number(value),
  }
}

/**
 * A rule context of a PF card order delivered 3 days ago.
 *
 * @param change - Fields to override.
 * @returns The context.
 */
function context(change: Partial<RefundContext> = {}): RefundContext {
  return {
    status: "DELIVERED",
    paymentMethod: "CARD",
    personType: "PF",
    corporate: false,
    providerPayment: {
      amount: "1000.00",
      refundedAmount: "0.00",
      approvedAt: new Date(now.getTime() - 10 * DAY),
    },
    settledAmount: "0.00",
    completedRefunds: "0.00",
    hasInFlightRefund: false,
    deliveredAt: new Date(now.getTime() - 3 * DAY),
    ...change,
  }
}

describe("refund rules (RF34, RN07, RN18, RN22)", () => {
  it("refunds a PF withdrawal in full within the days of the receipt", () => {
    const decision = decideRefund(
      context(),
      { reason: "WITHDRAWAL", kind: "FULL" },
      settings,
      now
    )
    expect(decision).toEqual({
      ok: true,
      amount: "1000.00",
      channel: "MERCADO_PAGO",
      requiresApproval: false,
      closesOrder: true,
    })
  })

  it("refuses a withdrawal after the deadline, partial or of a company", () => {
    const late = context({ deliveredAt: new Date(now.getTime() - 8 * DAY) })
    expect(
      decideRefund(late, { reason: "WITHDRAWAL", kind: "FULL" }, settings, now)
        .ok
    ).toBe(false)
    expect(
      decideRefund(
        context(),
        { reason: "WITHDRAWAL", kind: "PARTIAL", amount: "10.00" },
        settings,
        now
      )
    ).toEqual({
      ok: false,
      message: "O arrependimento gera reembolso integral.",
    })
    expect(
      decideRefund(
        context({ corporate: true, personType: "PJ" }),
        { reason: "WITHDRAWAL", kind: "FULL" },
        settings,
        now
      ).ok
    ).toBe(false)
    expect(
      decideRefund(
        context({ deliveredAt: null, status: "PAID" }),
        { reason: "WITHDRAWAL", kind: "FULL" },
        settings,
        now
      ).ok
    ).toBe(false)
  })

  it("keeps the withdrawal outside the Mercado Pago deadline", () => {
    const old = context({
      providerPayment: {
        amount: "1000.00",
        refundedAmount: "0.00",
        approvedAt: new Date(now.getTime() - 200 * DAY),
      },
    })
    expect(
      decideRefund(old, { reason: "WITHDRAWAL", kind: "FULL" }, settings, now)
        .ok
    ).toBe(true)
    const decision = decideRefund(
      old,
      { reason: "EVALUATED_RETURN", kind: "FULL" },
      settings,
      now
    )
    expect(decision.ok).toBe(false)
  })

  it("needs the finance approval for a corporate invoiced order", () => {
    expect(
      refundNeedsApproval({
        corporate: true,
        paymentMethod: "INVOICED",
        status: "PAID",
      })
    ).toBe(true)
    expect(
      refundNeedsApproval({
        corporate: true,
        paymentMethod: "CARD",
        status: "SHIPPED",
      })
    ).toBe(true)
    expect(
      refundNeedsApproval({
        corporate: true,
        paymentMethod: "CARD",
        status: "PAID",
      })
    ).toBe(false)
    expect(
      refundNeedsApproval({
        corporate: false,
        paymentMethod: "CARD",
        status: "DELIVERED",
      })
    ).toBe(false)
  })

  it("refunds an invoiced order by transfer up to what was received", () => {
    const invoiced = context({
      corporate: true,
      personType: "PJ",
      paymentMethod: "INVOICED",
      status: "CANCELED",
      providerPayment: null,
      settledAmount: "5000.00",
    })
    expect(refundableCents(invoiced)).toBe(500000)
    const partial = decideRefund(
      invoiced,
      { reason: "CANCELLATION", kind: "PARTIAL", amount: "4500.00" },
      settings,
      now
    )
    expect(partial).toMatchObject({
      ok: true,
      amount: "4500.00",
      channel: "MANUAL_TRANSFER",
      requiresApproval: true,
      closesOrder: false,
    })
    expect(
      decideRefund(
        invoiced,
        { reason: "CANCELLATION", kind: "PARTIAL", amount: "5000.01" },
        settings,
        now
      ).ok
    ).toBe(false)
  })

  it("checks the partial amount, the reason and refunds in progress", () => {
    expect(
      decideRefund(
        context(),
        { reason: "ADJUSTMENT", kind: "PARTIAL", amount: "1000.00" },
        settings,
        now
      ).ok
    ).toBe(false)
    expect(
      decideRefund(
        context(),
        { reason: "ADJUSTMENT", kind: "PARTIAL", amount: "150.00" },
        settings,
        now
      )
    ).toMatchObject({ ok: true, amount: "150.00", closesOrder: false })
    expect(
      decideRefund(
        context(),
        { reason: "ADJUSTMENT", kind: "FULL" },
        settings,
        now
      ).ok
    ).toBe(false)
    expect(
      decideRefund(
        context(),
        { reason: "CANCELLATION", kind: "FULL" },
        settings,
        now
      ).ok
    ).toBe(false)
    expect(
      decideRefund(
        context({ hasInFlightRefund: true }),
        { reason: "WITHDRAWAL", kind: "FULL" },
        settings,
        now
      ).ok
    ).toBe(false)
    expect(
      decideRefund(
        context({ status: "AWAITING_PAYMENT" }),
        { reason: "ADJUSTMENT", kind: "PARTIAL", amount: "1.00" },
        settings,
        now
      ).ok
    ).toBe(false)
  })

  it("counts refunds done in the Mercado Pago panel", () => {
    const refunded = context({
      providerPayment: {
        amount: "1000.00",
        refundedAmount: "300.00",
        approvedAt: now,
      },
      completedRefunds: "100.00",
    })
    expect(refundableCents(refunded)).toBe(70000)
    expect(paymentStatusAfterRefund("1000.00", "1000.00")).toBe("REFUNDED")
    expect(paymentStatusAfterRefund("1000.00", "999.99")).toBe(
      "PARTIALLY_REFUNDED"
    )
  })
})

describe("refund request schema", () => {
  const base = {
    orderId,
    reason: "ADJUSTMENT",
    kind: "PARTIAL",
    note: "Diferença de frete cobrada a mais.",
  }

  it("reads pt-BR and dotted amounts", () => {
    expect(
      refundRequestSchema.parse({ ...base, amount: "1.234,5" }).amount
    ).toBe("1234.50")
    expect(refundRequestSchema.parse({ ...base, amount: "99.9" }).amount).toBe(
      "99.90"
    )
    expect(
      refundRequestSchema.parse({ ...base, kind: "FULL", amount: "abc" }).amount
    ).toBeNull()
  })

  it("asks for the partial amount and the justification", () => {
    expect(refundRequestSchema.safeParse({ ...base, amount: "" }).success).toBe(
      false
    )
    expect(
      refundRequestSchema.safeParse({ ...base, amount: "10", note: "curta" })
        .success
    ).toBe(false)
  })
})

describe("Mercado Pago refund client (RF34)", () => {
  beforeEach(() => {
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-token")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllEnvs())

  it("sends the amount with the idempotency key", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ id: 987, amount: 150, status: "approved" }),
          { status: 201 }
        )
    )
    const refund = await realCreateRefund(
      { paymentId: "1234567890", amount: "150.00", idempotencyKey: refundId },
      fetcher as unknown as typeof fetch
    )
    expect(refund).toEqual({ id: "987", amount: "150.00", status: "approved" })
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      "https://api.mercadopago.com/v1/payments/1234567890/refunds"
    )
    expect(JSON.parse(String(init.body))).toEqual({ amount: 150 })
    expect((init.headers as Record<string, string>)["X-Idempotency-Key"]).toBe(
      refundId
    )
  })

  it("tells a refusal from an unavailable API", async () => {
    const refused = vi.fn(async () => new Response("{}", { status: 400 }))
    await expect(
      realCreateRefund(
        { paymentId: "1", amount: "1.00", idempotencyKey: refundId },
        refused as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ kind: "refused" })
    const down = vi.fn(async () => new Response("{}", { status: 503 }))
    await expect(
      realCreateRefund(
        { paymentId: "1", amount: "1.00", idempotencyKey: refundId },
        down as unknown as typeof fetch
      )
    ).rejects.toMatchObject({ kind: "unavailable" })
  })
})

/** Resets every mock of the fake Prisma. */
function resetDb() {
  for (const group of Object.values(db)) {
    if (typeof group === "function") group.mockReset()
    else for (const fn of Object.values(group)) fn.mockReset()
  }
  db.$transaction.mockImplementation((run: (client: typeof db) => unknown) =>
    run(db)
  )
  db.setting.findUnique.mockImplementation(
    ({ where }: { where: { key: string } }) => ({
      key: where.key,
      value: where.key === "refund.withdrawal_days" ? 7 : 180,
    })
  )
  db.emailOutbox.create.mockResolvedValue({ id: "email-1" })
}

/**
 * An order as the refund actions read it.
 *
 * @param change - Fields to override.
 * @returns The order.
 */
function order(change: Record<string, unknown> = {}) {
  return {
    id: orderId,
    number: "AB-2026-000201",
    status: "DELIVERED",
    paymentMethod: "CARD",
    total: decimal("1000.00"),
    organizationId: null,
    user: { name: "Cliente Teste", email: "pf@teste.test", personType: "PF" },
    organization: null,
    shipment: { deliveredAt: new Date(Date.now() - 2 * DAY) },
    payments: [
      {
        id: paymentRowId,
        paymentId: "1234567890",
        amount: decimal("1000.00"),
        refundedAmount: decimal("0.00"),
        paidAt: new Date(Date.now() - 5 * DAY),
      },
    ],
    receivables: [],
    refunds: [],
    ...change,
  }
}

/**
 * A refund row as the completion step reads it.
 *
 * @param change - Fields to override.
 * @returns The refund.
 */
function processingRefund(change: Record<string, unknown> = {}) {
  return {
    id: refundId,
    status: "PROCESSING",
    kind: "FULL",
    reason: "WITHDRAWAL",
    channel: "MERCADO_PAGO",
    amount: decimal("1000.00"),
    paymentRowId,
    payment: { paymentId: "1234567890" },
    order: {
      id: orderId,
      number: "AB-2026-000201",
      total: decimal("1000.00"),
      status: "DELIVERED",
      user: { name: "Cliente Teste", email: "pf@teste.test" },
    },
    ...change,
  }
}

describe("refund actions (#59)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    resetDb()
    requirePermission.mockReset()
    transitionOrder.mockReset()
    createMercadoPagoRefund.mockReset()
    requirePermission.mockResolvedValue({
      user: { id: "finance-1", name: "Financeiro", email: "f@x.test" },
      permissions: new Set(["payment:refund", "credit:approve"]),
    })
    transitionOrder.mockResolvedValue({
      orderId,
      number: "AB-2026-000201",
      from: "DELIVERED",
      to: "REFUNDED",
    })
  })

  const withdrawal = {
    orderId,
    reason: "WITHDRAWAL" as const,
    kind: "FULL" as const,
    note: "Cliente desistiu da compra dentro do prazo.",
  }

  it("refunds a PF withdrawal in full through Mercado Pago, audited", async () => {
    db.$queryRaw.mockResolvedValue([{ id: orderId }])
    db.order.findUniqueOrThrow.mockResolvedValue(order())
    db.refund.create.mockResolvedValue({ id: refundId })
    db.refund.findUnique
      .mockResolvedValueOnce(processingRefund())
      .mockResolvedValueOnce(processingRefund())
    db.payment.findUniqueOrThrow.mockResolvedValue({
      amount: decimal("1000.00"),
      refundedAmount: decimal("0.00"),
    })
    db.refund.aggregate.mockResolvedValue({ _sum: { amount: null } })
    createMercadoPagoRefund.mockResolvedValue({
      id: "555",
      amount: "1000.00",
      status: "approved",
    })

    const result = await requestRefund(withdrawal)

    expect(requirePermission).toHaveBeenCalledWith("payment:refund")
    expect(result).toMatchObject({ success: true, status: "COMPLETED" })
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        kind: "FULL",
        reason: "WITHDRAWAL",
        channel: "MERCADO_PAGO",
        amount: "1000.00",
        status: "PROCESSING",
        paymentRowId,
        requestedById: "finance-1",
      }),
      select: { id: true },
    })
    expect(createMercadoPagoRefund).toHaveBeenCalledWith({
      paymentId: "1234567890",
      amount: "1000.00",
      idempotencyKey: refundId,
    })
    expect(db.payment.update).toHaveBeenCalledWith({
      where: { id: paymentRowId },
      data: { refundedAmount: "1000.00", status: "REFUNDED" },
    })
    expect(transitionOrder).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ orderId, to: "REFUNDED" })
    )
    const actions = db.auditLog.create.mock.calls.map(
      (call) => (call[0] as { data: { action: string } }).data.action
    )
    expect(actions).toEqual(["refund.request", "refund.complete"])
    expect(db.emailOutbox.create).toHaveBeenCalled()
  })

  it("sends a corporate invoiced refund to the finance approval", async () => {
    db.$queryRaw.mockResolvedValue([{ id: orderId }])
    db.order.findUniqueOrThrow.mockResolvedValue(
      order({
        status: "CANCELED",
        paymentMethod: "INVOICED",
        organizationId: "org-1",
        organization: { name: "Empresa Fictícia" },
        user: { name: "Comprador", email: "pj@teste.test", personType: "PJ" },
        payments: [],
        receivables: [{ amount: decimal("500.00") }],
      })
    )
    db.refund.create.mockResolvedValue({ id: refundId })

    const result = await requestRefund({
      orderId,
      reason: "CANCELLATION",
      kind: "FULL",
      note: "Cancelamento aprovado pelo comercial.",
    })

    expect(result).toMatchObject({
      success: true,
      status: "PENDING_APPROVAL",
    })
    expect(db.refund.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        channel: "MANUAL_TRANSFER",
        amount: "500.00",
        status: "PENDING_APPROVAL",
        paymentRowId: null,
      }),
      select: { id: true },
    })
    expect(createMercadoPagoRefund).not.toHaveBeenCalled()
  })

  it("approves an invoiced refund with credit:approve and records it", async () => {
    db.refund.findUnique
      .mockResolvedValueOnce({
        status: "PENDING_APPROVAL",
        amount: decimal("500.00"),
        orderId,
      })
      .mockResolvedValueOnce(
        processingRefund({
          channel: "MANUAL_TRANSFER",
          amount: decimal("500.00"),
          payment: null,
        })
      )
      .mockResolvedValueOnce(
        processingRefund({
          channel: "MANUAL_TRANSFER",
          amount: decimal("500.00"),
          paymentRowId: null,
          reason: "CANCELLATION",
          order: {
            id: orderId,
            number: "AB-2026-000201",
            total: decimal("1000.00"),
            status: "CANCELED",
            user: { name: "Comprador", email: "pj@teste.test" },
          },
        })
      )
    db.order.findUniqueOrThrow.mockResolvedValue(
      order({
        status: "CANCELED",
        paymentMethod: "INVOICED",
        organizationId: "org-1",
        payments: [],
        receivables: [{ amount: decimal("500.00") }],
        refunds: [
          { id: refundId, status: "PENDING_APPROVAL", amount: decimal("500") },
        ],
      })
    )

    const result = await approveRefund({ refundId, note: "Multa isenta." })

    expect(requirePermission).toHaveBeenCalledWith("credit:approve")
    expect(result).toMatchObject({ success: true, status: "COMPLETED" })
    expect(db.refund.update).toHaveBeenCalledWith({
      where: { id: refundId },
      data: expect.objectContaining({
        status: "PROCESSING",
        decidedById: "finance-1",
        decisionNote: "Multa isenta.",
      }),
    })
    expect(createMercadoPagoRefund).not.toHaveBeenCalled()
    expect(transitionOrder).toHaveBeenCalledWith(
      db,
      expect.objectContaining({ to: "REFUNDED" })
    )
    const actions = db.auditLog.create.mock.calls.map(
      (call) => (call[0] as { data: { action: string } }).data.action
    )
    expect(actions).toEqual(["refund.approve", "refund.complete"])
  })

  it("refuses a refund with the reason, audited", async () => {
    db.refund.updateMany.mockResolvedValue({ count: 1 })
    const result = await rejectRefund({ refundId, note: "Fora da política." })
    expect(result).toEqual({ success: true })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "refund.reject" }),
    })
    expect((await rejectRefund({ refundId, note: "" })).success).toBe(false)
  })

  it("keeps the refund processing when Mercado Pago does not answer", async () => {
    db.refund.findUnique.mockResolvedValue(processingRefund())
    createMercadoPagoRefund.mockRejectedValue(
      new MercadoPagoError("unavailable")
    )
    const result = await retryRefund({ refundId })
    expect(result).toMatchObject({ success: true, status: "PROCESSING" })
    expect(db.refund.updateMany).not.toHaveBeenCalled()
    expect(transitionOrder).not.toHaveBeenCalled()
  })

  it("marks the refund failed when Mercado Pago refuses it", async () => {
    db.refund.findUnique.mockResolvedValue(processingRefund())
    db.refund.updateMany.mockResolvedValue({ count: 1 })
    createMercadoPagoRefund.mockRejectedValue(
      new MercadoPagoError("refused", 400)
    )
    const result = await retryRefund({ refundId })
    expect(result).toMatchObject({ success: true, status: "FAILED" })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "refund.fail" }),
    })
  })

  it("refuses a withdrawal after the deadline without calling Mercado Pago", async () => {
    db.$queryRaw.mockResolvedValue([{ id: orderId }])
    db.order.findUniqueOrThrow.mockResolvedValue(
      order({ shipment: { deliveredAt: new Date(Date.now() - 9 * DAY) } })
    )
    const result = await requestRefund(withdrawal)
    expect(result.success).toBe(false)
    expect(db.refund.create).not.toHaveBeenCalled()
    expect(createMercadoPagoRefund).not.toHaveBeenCalled()
  })
})

describe("refund e-mail", () => {
  it("tells how much went back", () => {
    const email = refundCompletedEmail({
      name: "Cliente",
      number: "AB-2026-000201",
      total: "1000.00",
      url: "https://loja.test/conta/pedidos/1",
      amount: "150.00",
      full: false,
      channel: "MERCADO_PAGO",
    })
    expect(email.subject).toBe("Pedido AB-2026-000201: estorno parcial")
    expect(email.text).toContain("150,00")
  })
})
