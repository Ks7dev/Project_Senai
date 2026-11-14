import { beforeEach, describe, expect, it, vi } from "vitest"

const requirePermission = vi.fn()
const processInvoice = vi.fn()
const db = {
  $transaction: vi.fn(),
  invoice: { updateMany: vi.fn(), findUnique: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("@/features/shared/lib/db/permissions", () => ({
  requirePermission: (permission: string) => requirePermission(permission),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/nfe/nfe-service", () => ({
  processInvoice: (...args: unknown[]) => processInvoice(...args),
}))
vi.mock("@/features/shared/lib/storage/storage", () => ({
  readStoredFile: vi.fn(async () => Buffer.from("%PDF")),
}))

const { reprocessInvoice, loadInvoiceFile } =
  await import("@/features/finance/invoices/action/invoice-actions")

const invoiceId = "019a7b1e-0000-7000-8000-000000000401"
const accessKey = "35261112345678000195550010000000011000000010"

describe("NF-e back office actions (#63)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    requirePermission.mockReset()
    processInvoice.mockReset()
    db.invoice.updateMany.mockReset()
    db.invoice.findUnique.mockReset()
    db.auditLog.create.mockReset()
    db.$transaction.mockImplementation((run: (client: typeof db) => unknown) =>
      run(db)
    )
    requirePermission.mockResolvedValue({
      user: { id: "finance-1", name: "Financeiro", email: "f@x.test" },
      permissions: new Set(["invoice:manage"]),
    })
  })

  it("reprocesses a failed NF-e by hand, audited", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 1 })
    processInvoice.mockResolvedValue({
      status: "PROCESSING",
      message: "NF-e enviada ao emissor.",
    })
    const result = await reprocessInvoice({ invoiceId })
    expect(requirePermission).toHaveBeenCalledWith("invoice:manage")
    expect(result).toEqual({
      success: true,
      status: "PROCESSING",
      message: "NF-e enviada ao emissor.",
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "invoice.reprocess",
        userId: "finance-1",
      }),
    })
    expect(processInvoice).toHaveBeenCalledWith(
      invoiceId,
      expect.objectContaining({ manual: true, userId: "finance-1" })
    )
  })

  it("never sends an issued NF-e again", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 })
    const result = await reprocessInvoice({ invoiceId })
    expect(result.success).toBe(false)
    expect(processInvoice).not.toHaveBeenCalled()
  })

  it("serves the XML and the DANFE only of an issued NF-e", async () => {
    db.invoice.findUnique.mockResolvedValue({
      status: "ISSUED",
      accessKey,
      xml: "<nfeProc/>",
      danfeKey: `invoices/x/danfe-${accessKey}.pdf`,
    })
    const xml = await loadInvoiceFile({ invoiceId, kind: "xml" })
    expect(xml).toMatchObject({
      success: true,
      file: { name: `nfe-${accessKey}.xml` },
    })
    const danfe = await loadInvoiceFile({ invoiceId, kind: "danfe" })
    expect(danfe).toMatchObject({
      success: true,
      file: { contentType: "application/pdf" },
    })
    db.invoice.findUnique.mockResolvedValue({
      status: "FAILED",
      accessKey: null,
      xml: null,
      danfeKey: null,
    })
    expect((await loadInvoiceFile({ invoiceId, kind: "xml" })).success).toBe(
      false
    )
  })
})
