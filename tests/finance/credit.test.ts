import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateCreditSchema } from "@/features/finance/credit-approval/schema/credit-approval-schema"
import {
  checkInvoicedCredit,
  CREDIT_NOT_APPROVED_MESSAGE,
  creditPosition,
} from "@/features/shared/lib/credit/credit-math"
import { AppError } from "@/features/shared/lib/errors/action-result"

const requirePermission = vi.fn()
const tx = {
  $queryRaw: vi.fn(),
  organization: { findFirst: vi.fn(), update: vi.fn() },
  creditLimitChange: { create: vi.fn() },
  auditLog: { create: vi.fn() },
  order: { groupBy: vi.fn() },
  receivable: { findMany: vi.fn() },
}

vi.mock("@/features/shared/lib/db/permissions", () => ({
  requirePermission: (permission: string) => requirePermission(permission),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    $transaction: (run: (client: typeof tx) => unknown) => run(tx),
    organization: { findMany: vi.fn() },
    order: { groupBy: (args: unknown) => tx.order.groupBy(args) },
    receivable: { findMany: (args: unknown) => tx.receivable.findMany(args) },
  },
}))

const { updateCorporateCredit } =
  await import("@/features/finance/credit-approval/action/credit-approval-actions")
const { assertInvoicedCredit } =
  await import("@/features/shared/lib/credit/credit-service")

/**
 * A Decimal-like value, as Prisma returns it.
 *
 * @param value - Decimal string.
 * @returns An object with `toFixed`.
 */
function decimal(value: string) {
  return { toFixed: () => Number(value).toFixed(2) }
}

describe("credit position (RN10)", () => {
  it("subtracts the credit in use from the limit of an approved account", () => {
    expect(
      creditPosition({ status: "APPROVED", limit: "50000.00", used: "12000.5" })
    ).toEqual({
      status: "APPROVED",
      limit: "50000.00",
      used: "12000.50",
      available: "37999.50",
      canBuyInvoiced: true,
    })
  })

  it("never shows a negative available credit", () => {
    const position = creditPosition({
      status: "APPROVED",
      limit: "1000.00",
      used: "1500.00",
    })
    expect(position.available).toBe("0.00")
    expect(position.canBuyInvoiced).toBe(false)
  })

  it("gives no credit to accounts not approved", () => {
    for (const status of ["NONE", "PENDING", "REJECTED"] as const) {
      const position = creditPosition({ status, limit: "5000.00", used: "0" })
      expect(position.available).toBe("0.00")
      expect(position.canBuyInvoiced).toBe(false)
    }
  })

  it("blocks an invoiced order above the available credit", () => {
    const position = creditPosition({
      status: "APPROVED",
      limit: "10000.00",
      used: "9000.00",
    })
    expect(checkInvoicedCredit(position, "1000.00")).toEqual({ allowed: true })
    const refused = checkInvoicedCredit(position, "1000.01")
    expect(refused).toMatchObject({
      allowed: false,
      code: "credit_limit_exceeded",
    })
    expect(!refused.allowed && refused.message).toContain("1.000,00")
  })

  it("blocks invoiced orders of accounts not approved (RN03)", () => {
    expect(
      checkInvoicedCredit(
        creditPosition({ status: "PENDING", limit: null, used: "0" }),
        "10.00"
      )
    ).toEqual({
      allowed: false,
      code: "credit_not_approved",
      message: CREDIT_NOT_APPROVED_MESSAGE,
    })
  })
})

describe("credit decision schema (RF58)", () => {
  const base = { organizationId: "org-1" }

  it("normalizes the limit of an approval", () => {
    expect(
      updateCreditSchema.parse({
        ...base,
        status: "APPROVED",
        limit: "50000,5",
      })
    ).toEqual({
      organizationId: "org-1",
      status: "APPROVED",
      limit: "50000.50",
      note: "",
    })
  })

  it("requires a positive limit to approve", () => {
    for (const limit of ["", "0", "-1", "1.234,56", "abc"]) {
      expect(
        updateCreditSchema.safeParse({ ...base, status: "APPROVED", limit })
          .success
      ).toBe(false)
    }
  })

  it("requires a justification to refuse and drops the limit", () => {
    expect(
      updateCreditSchema.safeParse({
        ...base,
        status: "REJECTED",
        note: "curto",
      }).success
    ).toBe(false)
    expect(
      updateCreditSchema.parse({
        ...base,
        status: "REJECTED",
        limit: "1000",
        note: "Restrições no cadastro financeiro.",
      }).limit
    ).toBeNull()
  })
})

describe("credit decision action (#61, RF58)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.spyOn(console, "warn").mockImplementation(() => {})
    requirePermission.mockReset()
    for (const group of Object.values(tx)) {
      if (typeof group === "function") group.mockReset()
      else for (const fn of Object.values(group)) fn.mockReset()
    }
    requirePermission.mockResolvedValue({
      user: { id: "finance-1", name: "Financeiro", email: "f@x.test" },
      permissions: new Set(["credit:approve"]),
    })
    tx.order.groupBy.mockResolvedValue([
      { organizationId: "org-1", _sum: { total: decimal("2000.00") } },
    ])
    tx.creditLimitChange.create.mockResolvedValue({ id: "change-1" })
    tx.receivable.findMany.mockResolvedValue([])
  })

  it("checks credit:approve and records the change with the history and audit", async () => {
    tx.organization.findFirst.mockResolvedValue({
      id: "org-1",
      creditStatus: "PENDING",
      creditLimit: null,
    })
    const result = await updateCorporateCredit({
      organizationId: "org-1",
      status: "APPROVED",
      limit: "30000",
      note: "Cadastro aprovado.",
    })
    expect(requirePermission).toHaveBeenCalledWith("credit:approve")
    expect(result).toEqual({
      success: true,
      credit: {
        status: "APPROVED",
        limit: "30000.00",
        used: "2000.00",
        available: "28000.00",
        canBuyInvoiced: true,
      },
    })
    expect(tx.$queryRaw).toHaveBeenCalled()
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { creditStatus: "APPROVED", creditLimit: "30000.00" },
    })
    expect(tx.creditLimitChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        previousStatus: "PENDING",
        previousLimit: null,
        newLimit: "30000.00",
        status: "APPROVED",
        changedById: "finance-1",
        note: "Cadastro aprovado.",
      }),
      select: { id: true },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "finance-1",
        action: "credit.update",
        entity: "organization",
        entityId: "org-1",
      }),
    })
  })

  it("refuses users without the permission", async () => {
    requirePermission.mockRejectedValue(
      new AppError("Você não tem permissão para esta ação.", "forbidden")
    )
    expect(
      await updateCorporateCredit({
        organizationId: "org-1",
        status: "APPROVED",
        limit: "1000",
      })
    ).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(tx.organization.update).not.toHaveBeenCalled()
  })

  it("refuses a decision that changes nothing", async () => {
    tx.organization.findFirst.mockResolvedValue({
      id: "org-1",
      creditStatus: "APPROVED",
      creditLimit: decimal("1000.00"),
    })
    const result = await updateCorporateCredit({
      organizationId: "org-1",
      status: "APPROVED",
      limit: "1000",
    })
    expect(result.success).toBe(false)
    expect(tx.creditLimitChange.create).not.toHaveBeenCalled()
  })
})

describe("invoiced credit guard (RN10)", () => {
  beforeEach(() => {
    tx.$queryRaw.mockReset()
    tx.organization.findFirst.mockReset()
    tx.order.groupBy.mockReset()
    tx.receivable.findMany.mockReset()
    tx.receivable.findMany.mockResolvedValue([
      { amount: decimal("500.00"), order: { organizationId: "org-1" } },
    ])
  })

  it("locks the account, gives back the settled installments and blocks an order above the available credit", async () => {
    tx.organization.findFirst.mockResolvedValue({
      creditStatus: "APPROVED",
      creditLimit: decimal("10000.00"),
    })
    tx.order.groupBy.mockResolvedValue([
      { organizationId: "org-1", _sum: { total: decimal("8000.00") } },
    ])
    await expect(
      assertInvoicedCredit(tx as never, {
        organizationId: "org-1",
        amount: "2500.01",
      })
    ).rejects.toMatchObject({ code: "credit_limit_exceeded" })
    expect(tx.$queryRaw).toHaveBeenCalled()

    const position = await assertInvoicedCredit(tx as never, {
      organizationId: "org-1",
      amount: "2000.00",
      excludeOrderId: "order-1",
    })
    expect(position.used).toBe("7500.00")
    expect(position.available).toBe("2500.00")
    expect(tx.order.groupBy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          paymentMethod: "INVOICED",
          id: { not: "order-1" },
        }),
      })
    )
  })

  it("refuses invoiced orders without a corporate account", async () => {
    await expect(
      assertInvoicedCredit(tx as never, {
        organizationId: null,
        amount: "10.00",
      })
    ).rejects.toMatchObject({ code: "credit_not_approved" })
  })
})
