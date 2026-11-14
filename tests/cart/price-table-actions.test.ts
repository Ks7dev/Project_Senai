import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppError } from "@/features/shared/lib/errors/action-result"

const requirePermission = vi.fn()
const auditCreate = vi.fn()

const tx = {
  priceTable: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  priceTableItem: { deleteMany: vi.fn(), createMany: vi.fn() },
  product: { count: vi.fn() },
  organization: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  user: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  category: { findUnique: vi.fn() },
  volumeDiscount: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  auditLog: { create: (args: unknown) => auditCreate(args) },
}

vi.mock("@/features/shared/lib/db/permissions", () => ({
  requirePermission: (permission: string) => requirePermission(permission),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))

const {
  assignCustomerPriceTable,
  assignOrganizationPriceTable,
  removePriceTable,
  savePriceTable,
  saveVolumeDiscount,
} = await import("@/features/cart/price-tables/action/price-table-actions")

const tableId = "019a7b1e-0000-7000-8000-0000000000f1"
const productId = "019a7b1e-0000-7000-8000-00000000000a"
const categoryId = "019a7b1e-0000-7000-8000-0000000000c1"
const seller = { id: "u-sales", name: "Comercial", email: "c@a.test" }

/**
 * Price table row as Prisma returns it with the back office include.
 *
 * @param overrides - Fields to change.
 * @returns The row.
 */
function tableRow(overrides: object = {}) {
  return {
    id: tableId,
    name: "Corporativo",
    description: null,
    discountPercent: { toFixed: () => "5.00" },
    active: true,
    items: [
      {
        productId,
        discountPercent: { toFixed: () => "8.00" },
        product: { name: "Mesa" },
      },
    ],
    _count: { organizations: 1, users: 0 },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  requirePermission.mockResolvedValue({ user: seller })
})

describe("price table back office (#52, RF21)", () => {
  it("needs the customer:update permission", async () => {
    requirePermission.mockRejectedValue(
      new AppError("Você não tem permissão para esta ação.", "forbidden")
    )
    const result = await savePriceTable({
      name: "Corporativo",
      discountPercent: "5",
      items: [],
    })
    expect(result).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(requirePermission).toHaveBeenCalledWith("customer:update")
    expect(tx.priceTable.create).not.toHaveBeenCalled()
  })

  it("validates before checking the session", async () => {
    const result = await savePriceTable({
      name: "",
      discountPercent: "5",
      items: [],
    })
    expect(result.success).toBe(false)
    expect(requirePermission).not.toHaveBeenCalled()
  })

  it("creates a table with its product discounts and audits it", async () => {
    tx.priceTable.findFirst
      .mockResolvedValueOnce(null) // unique name
      .mockResolvedValueOnce(tableRow()) // saved table for the audit
    tx.product.count.mockResolvedValue(1)
    tx.priceTable.create.mockResolvedValue({ id: tableId })
    const result = await savePriceTable({
      name: "Corporativo",
      discountPercent: "5",
      items: [{ productId, discountPercent: "8" }],
    })
    expect(result).toEqual({ success: true, id: tableId })
    expect(tx.priceTableItem.createMany).toHaveBeenCalledWith({
      data: [{ priceTableId: tableId, productId, discountPercent: "8" }],
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: seller.id,
        action: "price_table.create",
        entity: "price_table",
        entityId: tableId,
      }),
    })
  })

  it("refuses a repeated name", async () => {
    tx.priceTable.findFirst.mockResolvedValueOnce({ id: "other" })
    const result = await savePriceTable({
      name: "Corporativo",
      discountPercent: "5",
      items: [],
    })
    expect(result).toEqual({
      success: false,
      error: "Já existe uma tabela com este nome.",
    })
  })

  it("removes a table with soft delete and frees its customers", async () => {
    tx.priceTable.findFirst.mockResolvedValue(tableRow())
    const result = await removePriceTable({ id: tableId })
    expect(result).toEqual({ success: true })
    expect(tx.organization.updateMany).toHaveBeenCalledWith({
      where: { priceTableId: tableId },
      data: { priceTableId: null },
    })
    expect(tx.priceTable.update).toHaveBeenCalledWith({
      where: { id: tableId },
      data: { active: false, deletedAt: expect.any(Date) },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "price_table.delete" }),
    })
  })

  it("assigns a table to a corporate account", async () => {
    tx.organization.findFirst.mockResolvedValue({
      id: "org-1",
      priceTableId: null,
    })
    tx.priceTable.findFirst.mockResolvedValue({ id: tableId })
    const result = await assignOrganizationPriceTable({
      organizationId: "org-1",
      priceTableId: tableId,
    })
    expect(result).toEqual({ success: true })
    expect(tx.organization.update).toHaveBeenCalledWith({
      where: { id: "org-1" },
      data: { priceTableId: tableId },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "organization.price_table",
        before: { priceTableId: null },
        after: { priceTableId: tableId },
      }),
    })
  })

  it("refuses a PF table for a member of a corporate account", async () => {
    tx.user.findFirst.mockResolvedValue({
      id: "u1",
      name: "Solicitante",
      personType: "PJ",
      priceTableId: null,
      _count: { members: 1 },
    })
    const result = await assignCustomerPriceTable({
      email: "Solicitante@Empresa.test",
      priceTableId: tableId,
    })
    expect(result).toEqual({
      success: false,
      error:
        "Este cliente compra por uma conta corporativa: atribua a tabela à empresa.",
    })
    expect(tx.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "solicitante@empresa.test", deletedAt: null },
      })
    )
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it("removes the table of a PF customer", async () => {
    tx.user.findFirst.mockResolvedValue({
      id: "u2",
      name: "Cliente",
      personType: "PF",
      priceTableId: tableId,
      _count: { members: 0 },
    })
    const result = await assignCustomerPriceTable({
      email: "cliente@a.test",
      priceTableId: "",
    })
    expect(result).toEqual({ success: true, name: "Cliente" })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "u2" },
      data: { priceTableId: null },
    })
  })
})

describe("volume discount back office (#52, RN04)", () => {
  it("creates a rule and audits it", async () => {
    tx.category.findUnique.mockResolvedValue({ id: categoryId })
    tx.volumeDiscount.create.mockResolvedValue({
      id: "rule-1",
      categoryId,
      minQuantity: 10,
      minAmount: null,
      discountPercent: { toFixed: () => "5.00" },
      active: true,
      category: { name: "Papelaria nobre" },
    })
    const result = await saveVolumeDiscount({
      categoryId,
      minQuantity: "10",
      minAmount: "",
      discountPercent: "5",
    })
    expect(result).toEqual({ success: true, id: "rule-1" })
    expect(tx.volumeDiscount.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          categoryId,
          minQuantity: 10,
          minAmount: null,
          discountPercent: "5",
          active: true,
        },
      })
    )
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "volume_discount.create",
        after: expect.objectContaining({
          categoryName: "Papelaria nobre",
          minQuantity: "10",
          discountPercent: "5.00",
        }),
      }),
    })
  })
})
