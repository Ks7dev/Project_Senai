import { Prisma } from "@/generated/prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  adminModules,
  PENDING_ADMIN_ROUTES,
  visibleAdminModules,
} from "@/features/shared/lib/auth/permissions"
import {
  CONSENT_VERSION,
  hasConsent,
  parseConsent,
  serializeConsent,
} from "@/features/shared/lib/privacy/consent"
import { roles } from "@/prisma/seed-data"

const getCurrentUser = vi.fn()
const rolePermissionFindMany = vi.fn()
const verifyPassword = vi.fn()

const db = {
  user: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  address: { findMany: vi.fn(), updateMany: vi.fn() },
  member: { findMany: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
  order: { findMany: vi.fn(), count: vi.fn() },
  quote: { findMany: vi.fn() },
  favorite: { findMany: vi.fn(), deleteMany: vi.fn() },
  session: { findMany: vi.fn(), deleteMany: vi.fn() },
  account: { deleteMany: vi.fn() },
  twoFactor: { deleteMany: vi.fn() },
  cart: { deleteMany: vi.fn() },
  invitation: { deleteMany: vi.fn() },
  userRole: { deleteMany: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "10.0.0.5" }),
}))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/auth/auth", () => ({
  getAuth: () => ({ api: { verifyPassword } }),
}))
vi.mock("@/features/shared/lib/rate-limit/action-limit", () => ({
  enforceActionRateLimit: async () => undefined,
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...db,
    rolePermission: { findMany: (a: unknown) => rolePermissionFindMany(a) },
    $transaction: async (fn: (client: typeof db) => Promise<unknown>) => fn(db),
  },
}))

const { anonymizeUser, buildPersonalDataExport, anonymizedDocument } =
  await import("@/features/shared/lib/privacy/personal-data")
const { deleteMyData, exportMyData } =
  await import("@/features/account/privacy/action/privacy-actions")
const { anonymizeSubject, findPrivacySubjects } =
  await import("@/features/backoffice/privacy-requests/action/privacy-request-actions")

/** Resets every mock to an empty, closed account. */
function resetDb() {
  for (const model of Object.values(db)) {
    for (const fn of Object.values(model)) fn.mockReset()
  }
  db.user.findUnique.mockResolvedValue({
    email: "cliente@exemplo.com",
    deletedAt: null,
  })
  db.order.count.mockResolvedValue(0)
  db.member.findMany.mockResolvedValue([])
  for (const model of [
    db.session,
    db.account,
    db.twoFactor,
    db.favorite,
    db.cart,
    db.member,
    db.invitation,
    db.userRole,
  ]) {
    model.deleteMany.mockResolvedValue({ count: 1 })
  }
  db.address.updateMany.mockResolvedValue({ count: 2 })
}

describe("cookie consent (#75, RF56)", () => {
  it("runs nothing non-essential before a choice", () => {
    expect(parseConsent(undefined)).toBeNull()
    expect(parseConsent("lixo")).toBeNull()
    expect(hasConsent(null, "analytics")).toBe(false)
  })

  it("keeps the accepted categories only", () => {
    const choice = parseConsent(
      serializeConsent({ analytics: true, marketing: false })
    )
    expect(choice?.version).toBe(CONSENT_VERSION)
    expect(hasConsent(choice, "analytics")).toBe(true)
    expect(hasConsent(choice, "marketing")).toBe(false)
  })

  it("asks again when the notice version changes", () => {
    const old = encodeURIComponent(
      JSON.stringify({
        version: CONSENT_VERSION + 1,
        analytics: true,
        marketing: true,
        decidedAt: new Date().toISOString(),
      })
    )
    expect(parseConsent(old)).toBeNull()
  })
})

describe("LGPD module access (#75, RNF03)", () => {
  it("delivers /admin/lgpd only to profiles with privacy:manage", () => {
    expect(PENDING_ADMIN_ROUTES.has("/admin/lgpd")).toBe(false)
    expect(adminModules.map((m) => m.href)).toContain("/admin/lgpd")
    const visible = (key: string) =>
      visibleAdminModules(
        new Set(roles.find((role) => role.key === key)!.permissions)
      ).map((m) => m.href)
    expect(visible("admin")).toContain("/admin/lgpd")
    for (const key of ["sales", "finance", "stock"]) {
      expect(visible(key)).not.toContain("/admin/lgpd")
    }
  })
})

describe("personal data export (#75, RF56)", () => {
  beforeEach(resetDb)

  it("uses Portuguese labels and leaves secrets out", async () => {
    db.user.findUnique.mockResolvedValue({
      name: "Ana Teste",
      email: "ana@exemplo.com",
      emailVerified: true,
      personType: "PF",
      document: "12345678909",
      phone: null,
      createdAt: new Date("2026-11-01T12:00:00Z"),
      deletedAt: null,
    })
    db.address.findMany.mockResolvedValue([])
    db.member.findMany.mockResolvedValue([])
    db.order.findMany.mockResolvedValue([
      {
        number: "AB-1",
        status: "DELIVERED",
        paymentMethod: "PIX",
        subtotal: new Prisma.Decimal("100"),
        discount: new Prisma.Decimal("0"),
        servicesTotal: new Prisma.Decimal("0"),
        shippingTotal: new Prisma.Decimal("10"),
        total: new Prisma.Decimal("110"),
        shippingAddress: {},
        createdAt: new Date("2026-11-02T12:00:00Z"),
        items: [],
      },
    ])
    db.quote.findMany.mockResolvedValue([])
    db.favorite.findMany.mockResolvedValue([])
    db.session.findMany.mockResolvedValue([])

    const data = await buildPersonalDataExport("u1")
    expect(data.Cadastro).toMatchObject({
      Nome: "Ana Teste",
      "E-mail confirmado": "Sim",
      Tipo: "Pessoa física",
    })
    expect(data.Pedidos).toEqual([
      expect.objectContaining({ Número: "AB-1", Total: "110.00" }),
    ])
    const text = JSON.stringify(data)
    expect(text).not.toMatch(/password|senha|token|secret/i)
  })

  it("exports the data of the logged-in customer only", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", name: "A", email: "a@b" })
    db.user.findUnique.mockResolvedValue({
      name: "A",
      email: "a@b",
      emailVerified: false,
      personType: "PJ",
      document: "11222333000181",
      phone: null,
      createdAt: new Date(),
      deletedAt: null,
    })
    for (const fn of [
      db.address.findMany,
      db.member.findMany,
      db.order.findMany,
      db.quote.findMany,
      db.favorite.findMany,
      db.session.findMany,
    ]) {
      fn.mockResolvedValue([])
    }
    const result = await exportMyData()
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.file.mimeType).toBe("application/json")
    const decoded = JSON.parse(
      Buffer.from(result.file.data, "base64").toString("utf8")
    )
    expect(decoded.Cadastro.Tipo).toBe("Pessoa jurídica")
    expect(db.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "u1" } })
    )
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "privacy.export" }),
    })
  })
})

describe("anonymization (#75, RF56)", () => {
  beforeEach(resetDb)

  it("replaces personal data and keeps the account id for orders", async () => {
    const removed = await anonymizeUser(
      db as unknown as Prisma.TransactionClient,
      "u1"
    )
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: expect.objectContaining({
        name: "Titular anonimizado",
        email: "anonimizado+u1@anonimizado.invalid",
        document: anonymizedDocument("u1"),
        phone: null,
        deletedAt: expect.any(Date),
      }),
    })
    expect(anonymizedDocument("u1")).toHaveLength(14)
    expect(removed).toMatchObject({ sessions: 1, logins: 1, addresses: 2 })
    expect(db.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
    })
  })

  it("refuses while an order is in course", async () => {
    db.order.count.mockResolvedValue(1)
    await expect(
      anonymizeUser(db as unknown as Prisma.TransactionClient, "u1")
    ).rejects.toMatchObject({ code: "open_orders" })
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it("refuses the sole administrator of a corporate account", async () => {
    db.member.findMany.mockResolvedValue([{ organizationId: "o1" }])
    db.member.count.mockResolvedValueOnce(0).mockResolvedValueOnce(3)
    await expect(
      anonymizeUser(db as unknown as Prisma.TransactionClient, "u1")
    ).rejects.toMatchObject({ code: "sole_admin" })
  })

  it("checks the password before the customer deletes the data", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", name: "A", email: "a@b" })
    verifyPassword.mockResolvedValue({ status: true })
    const result = await deleteMyData({
      password: "senha-teste",
      confirmation: "excluir",
    })
    expect(result).toEqual({ success: true })
    expect(verifyPassword).toHaveBeenCalled()
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "privacy.anonymize",
        entityId: "u1",
      }),
    })
  })

  it("requires the confirmation phrase", async () => {
    const result = await deleteMyData({ password: "x", confirmation: "sim" })
    expect(result.success).toBe(false)
    expect(db.user.update).not.toHaveBeenCalled()
  })

  it("lets only privacy:manage anonymize another titular", async () => {
    getCurrentUser.mockResolvedValue({ id: "dpo", name: "D", email: "d@b" })
    rolePermissionFindMany.mockResolvedValue([])
    const input = {
      userId: "u1",
      protocol: "Atendimento 123",
      confirmation: "ANONIMIZAR",
    }
    expect((await anonymizeSubject(input)).success).toBe(false)
    expect(db.user.update).not.toHaveBeenCalled()

    rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: "privacy", action: "manage" } },
    ])
    expect(await anonymizeSubject(input)).toEqual({ success: true })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "dpo",
        entityId: "u1",
        after: expect.objectContaining({ protocol: "Atendimento 123" }),
      }),
    })
  })

  it("finds titulars only by full e-mail or document", async () => {
    getCurrentUser.mockResolvedValue({ id: "dpo", name: "D", email: "d@b" })
    rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: "privacy", action: "manage" } },
    ])
    expect((await findPrivacySubjects({ query: "ana" })).success).toBe(false)
    db.user.findMany.mockResolvedValue([])
    await findPrivacySubjects({ query: "123.456.789-09" })
    expect(db.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { document: "12345678909" } })
    )
  })
})
