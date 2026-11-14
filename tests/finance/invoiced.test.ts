import { beforeEach, describe, expect, it, vi } from "vitest"
import { invoicedInstallmentsEmail } from "@/emails/templates"
import { settleInstallmentSchema } from "@/features/finance/invoiced-billing/schema/invoiced-billing-schema"
import { AppError } from "@/features/shared/lib/errors/action-result"
import {
  boletoNumber,
  digitableLine,
  dueDateAfter,
  dueDateFactor,
  installmentState,
  mod10,
  mod11,
  planInstallments,
} from "@/features/shared/lib/invoiced/invoiced-math"

const requirePermission = vi.fn()
const transitionOrder = vi.fn()
const assertInvoicedCredit = vi.fn()
const tx = {
  $queryRaw: vi.fn(),
  receivable: {
    findUnique: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
  },
  order: { findFirst: vi.fn(), findUnique: vi.fn() },
  setting: { findUnique: vi.fn() },
  emailOutbox: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("@/features/shared/lib/db/permissions", () => ({
  requirePermission: (permission: string) => requirePermission(permission),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: { $transaction: (run: (client: typeof tx) => unknown) => run(tx) },
}))
vi.mock("@/features/shared/lib/orders/order-lifecycle", () => ({
  transitionOrder: (...args: unknown[]) => transitionOrder(...args),
}))
vi.mock("@/features/shared/lib/credit/credit-service", () => ({
  CREDIT_RELEASED_STATUSES: ["CANCELED", "REFUNDED"],
  assertInvoicedCredit: (...args: unknown[]) => assertInvoicedCredit(...args),
  loadCreditPosition: vi.fn(),
}))

const { settleInstallment, confirmInvoicedOrder } =
  await import("@/features/finance/invoiced-billing/action/invoiced-billing-actions")
const { createInvoicedInstallments } =
  await import("@/features/shared/lib/invoiced/invoiced-billing")

const installmentId = "019a7b1e-0000-7000-8000-000000000101"
const orderId = "019a7b1e-0000-7000-8000-000000000102"

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

/** Resets every mock of the fake transaction. */
function resetTx() {
  for (const group of Object.values(tx)) {
    if (typeof group === "function") group.mockReset()
    else for (const fn of Object.values(group)) fn.mockReset()
  }
}

describe("invoiced installments (RF33, RN03)", () => {
  const confirmedAt = new Date("2026-11-14T15:00:00.000Z")

  it("splits the total into the 28 and 56 day due dates", () => {
    const plan = planInstallments("10000.01", [56, 28], confirmedAt)
    expect(plan.map((item) => item.dueDays)).toEqual([28, 56])
    expect(plan.map((item) => item.amount)).toEqual(["5000.01", "5000.00"])
    expect(plan[0].dueDate.toISOString()).toBe("2026-12-13T02:59:59.999Z")
    expect(plan[1].dueDate.toISOString()).toBe("2027-01-10T02:59:59.999Z")
  })

  it("counts the days from the São Paulo date of the confirmation", () => {
    // 01:00 UTC is still the previous day in São Paulo
    expect(
      dueDateAfter(new Date("2026-11-15T01:00:00.000Z"), 28).toISOString()
    ).toBe("2026-12-13T02:59:59.999Z")
  })

  it("refuses a setting without valid due dates", () => {
    expect(() => planInstallments("10.00", [0, -1], confirmedAt)).toThrow()
  })

  it("marks an open installment past the due date as overdue", () => {
    const due = new Date("2026-12-13T02:59:59.999Z")
    expect(installmentState("OPEN", due, new Date("2026-12-12T12:00Z"))).toBe(
      "OPEN"
    )
    expect(installmentState("OPEN", due, new Date("2026-12-13T12:00Z"))).toBe(
      "OVERDUE"
    )
    expect(installmentState("PAID", due, new Date("2027-01-01T00:00Z"))).toBe(
      "PAID"
    )
  })
})

describe("own boleto (RF12)", () => {
  it("numbers the boleto with the order number and the sequence", () => {
    expect(boletoNumber("AB-2026-000123", 2)).toBe("202600012302")
  })

  it("computes the FEBRABAN check digits", () => {
    // Public example of a Banco do Brasil boleto
    expect(mod10("001905009")).toBe(5)
    expect(mod10("4014481606")).toBe(9)
    expect(mod10("0680935031")).toBe(4)
    expect(mod11("0019373700000001000500940144816060680935031")).toBe(3)
  })

  it("computes the due date factor in both cycles", () => {
    expect(dueDateFactor(new Date("2000-07-03T15:00:00Z"))).toBe("1000")
    expect(dueDateFactor(new Date("2025-02-21T15:00:00Z"))).toBe("9999")
    expect(dueDateFactor(new Date("2025-02-22T15:00:00Z"))).toBe("1000")
  })

  it("builds a digitable line with the amount and the factor", () => {
    const line = digitableLine({
      bankCode: "999",
      boletoNumber: "202600012301",
      dueDate: new Date("2025-02-23T02:59:59.999Z"),
      amount: "5000.01",
    })
    expect(line).toMatch(/^\d{5}\.\d{5} \d{5}\.\d{6} \d{5}\.\d{6} \d \d{14}$/)
    expect(line.startsWith("99990.")).toBe(true)
    expect(line.endsWith("10000000500001")).toBe(true)
  })
})

describe("settlement schema (RF33)", () => {
  it("normalizes the paid amount", () => {
    expect(
      settleInstallmentSchema.parse({
        installmentId,
        paidAt: "2026-11-14",
        paidAmount: "5000,5",
        method: "MANUAL",
      })
    ).toMatchObject({ paidAmount: "5000.50", note: "" })
  })

  it("refuses bad dates, amounts and methods", () => {
    const base = {
      installmentId,
      paidAt: "2026-11-14",
      paidAmount: "10",
      method: "MANUAL",
    }
    for (const change of [
      { paidAt: "14/11/2026" },
      { paidAmount: "abc" },
      { method: "PIX" },
    ]) {
      expect(
        settleInstallmentSchema.safeParse({ ...base, ...change }).success
      ).toBe(false)
    }
  })
})

describe("settlement action (#60)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    resetTx()
    requirePermission.mockReset()
    requirePermission.mockResolvedValue({
      user: { id: "finance-1", name: "Financeiro", email: "f@x.test" },
      permissions: new Set(["payment:refund"]),
    })
  })

  const input = {
    installmentId,
    paidAt: "2026-11-10",
    paidAmount: "5000.00",
    method: "MANUAL" as const,
    note: "Comprovante 123",
  }

  it("records who settled it, when and how, with the audit log", async () => {
    tx.receivable.findUnique.mockResolvedValue({
      id: installmentId,
      orderId,
      sequence: 1,
      amount: decimal("5000.00"),
      status: "OPEN",
      order: { number: "AB-2026-000123", status: "PAID" },
    })
    const result = await settleInstallment(input)
    expect(requirePermission).toHaveBeenCalledWith("payment:refund")
    expect(result).toEqual({
      success: true,
      orderNumber: "AB-2026-000123",
      sequence: 1,
    })
    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.receivable.update).toHaveBeenCalledWith({
      where: { id: installmentId },
      data: {
        status: "PAID",
        paidAt: new Date("2026-11-10T15:00:00.000Z"),
        paidAmount: "5000.00",
        settledById: "finance-1",
        settlementMethod: "MANUAL",
        settlementNote: "Comprovante 123",
      },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "installment.settle",
        entityId: installmentId,
        userId: "finance-1",
      }),
    })
  })

  it("refuses a partial payment and an installment already settled", async () => {
    tx.receivable.findUnique.mockResolvedValue({
      id: installmentId,
      orderId,
      sequence: 1,
      amount: decimal("5000.01"),
      status: "OPEN",
      order: { number: "AB-2026-000123", status: "PAID" },
    })
    expect((await settleInstallment(input)).success).toBe(false)
    tx.receivable.findUnique.mockResolvedValue({
      id: installmentId,
      orderId,
      sequence: 1,
      amount: decimal("5000.00"),
      status: "PAID",
      order: { number: "AB-2026-000123", status: "PAID" },
    })
    expect(await settleInstallment(input)).toEqual({
      success: false,
      error: "Esta parcela já foi baixada.",
    })
    expect(tx.receivable.update).not.toHaveBeenCalled()
  })

  it("refuses a payment date in the future", async () => {
    const result = await settleInstallment({ ...input, paidAt: "2999-01-01" })
    expect(result).toEqual({
      success: false,
      error: "A data do pagamento não pode estar no futuro.",
    })
  })
})

describe("finance confirmation of an invoiced order (RN13)", () => {
  beforeEach(() => {
    resetTx()
    requirePermission.mockReset()
    transitionOrder.mockReset()
    assertInvoicedCredit.mockReset()
    requirePermission.mockResolvedValue({
      user: { id: "finance-1", name: "Financeiro", email: "f@x.test" },
      permissions: new Set(["credit:approve"]),
    })
    tx.order.findFirst.mockResolvedValue({
      id: orderId,
      organizationId: "org-1",
      total: decimal("12000.00"),
    })
  })

  it("checks the credit before confirming", async () => {
    assertInvoicedCredit.mockRejectedValue(
      new AppError("Limite excedido.", "credit_limit_exceeded")
    )
    expect(await confirmInvoicedOrder({ orderId })).toEqual({
      success: false,
      error: "Limite excedido.",
    })
    expect(transitionOrder).not.toHaveBeenCalled()
  })

  it("moves the order to paid with the user and audits it", async () => {
    transitionOrder.mockResolvedValue({
      orderId,
      number: "AB-2026-000124",
      from: "AWAITING_PAYMENT",
      to: "PAID",
    })
    expect(await confirmInvoicedOrder({ orderId })).toEqual({
      success: true,
      number: "AB-2026-000124",
    })
    expect(requirePermission).toHaveBeenCalledWith("credit:approve")
    expect(assertInvoicedCredit).toHaveBeenCalledWith(tx, {
      organizationId: "org-1",
      amount: "12000.00",
      excludeOrderId: orderId,
    })
    expect(transitionOrder).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        orderId,
        to: "PAID",
        changedById: "finance-1",
        expectedFrom: ["AWAITING_PAYMENT"],
      })
    )
    expect(tx.auditLog.create).toHaveBeenCalled()
  })
})

describe("installments on confirmation (RF33)", () => {
  beforeEach(() => {
    resetTx()
    tx.setting.findUnique.mockResolvedValue({ value: [28, 56] })
    tx.emailOutbox.create.mockResolvedValue({ id: "mail-1" })
  })

  it("does nothing for orders paid through Mercado Pago", async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      number: "AB-2026-000125",
      total: decimal("100.00"),
      paymentMethod: "PIX",
      user: { name: "Cliente", email: "c@x.test" },
      receivables: [],
    })
    expect(
      await createInvoicedInstallments(tx as never, {
        orderId,
        now: new Date(),
      })
    ).toBe(0)
    expect(tx.receivable.createMany).not.toHaveBeenCalled()
  })

  it("creates one boleto per due date and e-mails the customer", async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      number: "AB-2026-000125",
      total: decimal("999.99"),
      paymentMethod: "INVOICED",
      user: { name: "Cliente", email: "c@x.test" },
      receivables: [],
    })
    const created = await createInvoicedInstallments(tx as never, {
      orderId,
      now: new Date("2026-11-14T15:00:00Z"),
    })
    expect(created).toBe(2)
    const rows = tx.receivable.createMany.mock.calls[0][0].data
    expect(rows.map((row: { amount: string }) => row.amount)).toEqual([
      "500.00",
      "499.99",
    ])
    expect(
      rows.map((row: { boletoNumber: string }) => row.boletoNumber)
    ).toEqual(["202600012501", "202600012502"])
    expect(tx.emailOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        template: "order.invoiced_installments",
        recipient: "c@x.test",
      }),
      select: { id: true },
    })
  })

  it("never creates the installments twice", async () => {
    tx.order.findUnique.mockResolvedValue({
      id: orderId,
      number: "AB-2026-000125",
      total: decimal("999.99"),
      paymentMethod: "INVOICED",
      user: { name: "Cliente", email: "c@x.test" },
      receivables: [{ id: "r1" }],
    })
    expect(
      await createInvoicedInstallments(tx as never, {
        orderId,
        now: new Date(),
      })
    ).toBe(0)
  })
})

describe("invoiced installments e-mail (RF53)", () => {
  it("lists the due dates and the digitable lines", () => {
    const email = invoicedInstallmentsEmail({
      name: "Cliente",
      number: "AB-2026-000125",
      total: "999.99",
      url: "https://loja.test/conta/pedidos/1",
      installments: [
        {
          sequence: 1,
          amount: "500.00",
          dueDate: new Date("2026-12-13T02:59:59.999Z"),
          digitableLine: "99990.00002 ...",
        },
      ],
    })
    expect(email.subject).toBe("Pedido AB-2026-000125: boletos do faturado")
    expect(email.text).toContain("12/12/2026")
    expect(email.text).toContain("99990.00002 ...")
    expect(email.text).toContain("homologação")
  })
})
