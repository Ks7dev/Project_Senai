import { beforeEach, describe, expect, it, vi } from "vitest"

const getCurrentUser = vi.fn()
const getCorporateContext = vi.fn()
const addressCount = vi.fn()
const addressFindFirst = vi.fn()
const addressCreate = vi.fn()
const addressUpdate = vi.fn()
const addressUpdateMany = vi.fn()

vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/corporate", () => ({
  getCorporateContext: () => getCorporateContext(),
}))
const tx = {
  address: {
    count: (a: unknown) => addressCount(a),
    findFirst: (a: unknown) => addressFindFirst(a),
    create: (a: unknown) => addressCreate(a),
    update: (a: unknown) => addressUpdate(a),
    updateMany: (a: unknown) => addressUpdateMany(a),
  },
  auditLog: { create: vi.fn() },
  organization: { findUnique: vi.fn().mockResolvedValue({ name: "Empresa" }) },
}
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))

const { saveAddress, deleteAddress } =
  await import("@/features/account/addresses/action/address-actions")
const { loadAccountContext, orderScope } =
  await import("@/features/account/overview/load-account")

const address = {
  label: "Matriz",
  recipient: "Recepção",
  cep: "01310-100",
  street: "Avenida Paulista",
  number: "1000",
  district: "Bela Vista",
  city: "São Paulo",
  state: "SP" as const,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  getCurrentUser.mockResolvedValue({
    id: "u1",
    name: "Ana Souza",
    email: "a@b.test",
  })
  getCorporateContext.mockResolvedValue(null)
  addressCreate.mockResolvedValue({
    id: "a1",
    label: "Matriz",
    isDefault: true,
  })
  addressUpdate.mockResolvedValue({
    id: "a1",
    label: "Matriz",
    isDefault: true,
  })
})

describe("addresses (#36, RF26)", () => {
  it("makes the first address of a PF customer the default", async () => {
    addressCount.mockResolvedValue(0)
    expect(await saveAddress(address)).toEqual({ success: true, id: "a1" })
    expect(addressCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "u1",
        organizationId: null,
        cep: "01310100",
        isDefault: true,
      }),
    })
  })

  it("stores corporate addresses under the company", async () => {
    getCorporateContext.mockResolvedValue({
      organizationId: "org-1",
      roles: ["admin"],
    })
    addressCount.mockResolvedValue(2)
    await saveAddress({ ...address, label: "Obra Centro" })
    expect(addressCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        userId: null,
        isDefault: false,
      }),
    })
  })

  it("lets only account administrators edit company addresses", async () => {
    getCorporateContext.mockResolvedValue({
      organizationId: "org-1",
      roles: ["requester"],
    })
    expect(await saveAddress(address)).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(addressCreate).not.toHaveBeenCalled()
  })

  it("unmarks the other addresses when choosing a new default", async () => {
    addressCount.mockResolvedValue(3)
    await saveAddress({ ...address, isDefault: true })
    expect(addressUpdateMany).toHaveBeenCalledWith({
      where: { userId: "u1", deletedAt: null },
      data: { isDefault: false },
    })
  })

  it("soft deletes and promotes another address to default", async () => {
    addressFindFirst
      .mockResolvedValueOnce({ id: "a1", label: "Matriz", isDefault: true })
      .mockResolvedValueOnce({ id: "a2" })
    expect(
      await deleteAddress({ id: "0196f5c2-0000-7000-8000-000000000001" })
    ).toEqual({ success: true })
    expect(addressUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "0196f5c2-0000-7000-8000-000000000001" },
      data: expect.objectContaining({ isDefault: false }),
    })
    expect(addressUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "a2" },
      data: { isDefault: true },
    })
  })

  it("rejects invalid CEP", async () => {
    expect((await saveAddress({ ...address, cep: "123" })).success).toBe(false)
  })
})

describe("customer area by profile (#37)", () => {
  it("shows PF customers only their own orders and no team menu", async () => {
    const context = await loadAccountContext()
    expect(context?.seesCompanyOrders).toBe(false)
    expect(context?.links.map((l) => l.href)).not.toContain("/conta/usuarios")
    expect(await orderScope(context!)).toEqual({ userId: "u1" })
  })

  it("shows requesters only their own orders", async () => {
    getCorporateContext.mockResolvedValue({
      organizationId: "org-1",
      roles: ["requester"],
    })
    const context = await loadAccountContext()
    expect(await orderScope(context!)).toEqual({ userId: "u1" })
    expect(context?.links.map((l) => l.href)).not.toContain("/conta/aprovacoes")
  })

  it("shows approvers the company orders and the approvals menu", async () => {
    getCorporateContext.mockResolvedValue({
      organizationId: "org-1",
      roles: ["approver"],
    })
    const context = await loadAccountContext()
    expect(await orderScope(context!)).toEqual({ organizationId: "org-1" })
    expect(context?.links.map((l) => l.href)).toContain("/conta/aprovacoes")
  })

  it("shows administrators the users menu", async () => {
    getCorporateContext.mockResolvedValue({
      organizationId: "org-1",
      roles: ["admin"],
    })
    const context = await loadAccountContext()
    expect(context?.links.map((l) => l.href)).toContain("/conta/usuarios")
  })
})
