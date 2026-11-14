import { beforeEach, describe, expect, it, vi } from "vitest"
import { AUDIT_PAGE_SIZE } from "@/features/backoffice/audit-log/schema/audit-log-schema"
import type { Prisma } from "@/generated/prisma/client"

const getCurrentUser = vi.fn()
const rolePermissionFindMany = vi.fn()
const auditFindMany = vi.fn()
const auditCreate = vi.fn()
let requestHeaders: Headers | null = null

vi.mock("next/headers", () => ({
  headers: async () => {
    if (!requestHeaders) throw new Error("outside a request scope")
    return requestHeaders
  },
}))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    auditLog: { findMany: (a: unknown) => auditFindMany(a) },
    rolePermission: { findMany: (a: unknown) => rolePermissionFindMany(a) },
  },
}))

const { clientIpFromHeaders } =
  await import("@/features/shared/lib/request/client-ip")
const { writeAudit } = await import("@/features/shared/lib/db/audit")
const auditActions =
  await import("@/features/backoffice/audit-log/action/audit-log-actions")

const tx = {
  auditLog: { create: (a: unknown) => auditCreate(a) },
} as unknown as Prisma.TransactionClient

describe("client IP (#76, RNF12)", () => {
  it("takes the first forwarded address", () => {
    expect(
      clientIpFromHeaders(
        new Headers({ "x-forwarded-for": "192.168.0.20, 10.0.0.1" })
      )
    ).toBe("192.168.0.20")
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "::1" }))).toBe("::1")
  })

  it("drops missing or forged values", () => {
    expect(clientIpFromHeaders(new Headers())).toBeNull()
    expect(
      clientIpFromHeaders(new Headers({ "x-forwarded-for": "<script>" }))
    ).toBeNull()
  })
})

describe("writeAudit (#76, RNF12)", () => {
  beforeEach(() => {
    auditCreate.mockReset()
    requestHeaders = null
  })

  it("records the IP of the request with before and after values", async () => {
    requestHeaders = new Headers({ "x-forwarded-for": "192.168.0.20" })
    await writeAudit(tx, {
      userId: "u1",
      action: "product.update",
      entity: "product",
      entityId: "p1",
      before: { price: "10.00" },
      after: { price: "12.00" },
    })
    expect(auditCreate).toHaveBeenCalledWith({
      data: {
        userId: "u1",
        action: "product.update",
        entity: "product",
        entityId: "p1",
        before: { price: "10.00" },
        after: { price: "12.00" },
        ipAddress: "192.168.0.20",
      },
    })
  })

  it("leaves the IP empty outside a request (scheduled jobs)", async () => {
    await writeAudit(tx, {
      userId: null,
      action: "quote.expire",
      entity: "quote",
    })
    const data = auditCreate.mock.calls[0]![0].data
    expect(data).not.toHaveProperty("ipAddress")
  })
})

describe("audit log viewer (#76, RNF12)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    getCurrentUser.mockResolvedValue({ id: "u-fin", name: "F", email: "f@b" })
    rolePermissionFindMany.mockResolvedValue([
      { permission: { resource: "audit", action: "read" } },
    ])
  })

  it("has no action that edits or deletes a row", () => {
    expect(Object.keys(auditActions)).toEqual(["listAuditLogs"])
  })

  it("refuses users without audit:read", async () => {
    rolePermissionFindMany.mockResolvedValue([])
    const result = await auditActions.listAuditLogs({})
    expect(result.success).toBe(false)
    expect(auditFindMany).not.toHaveBeenCalled()
  })

  it("filters by area, action, user and period in Brasília time", async () => {
    auditFindMany.mockResolvedValue([])
    await auditActions.listAuditLogs({
      entity: "order",
      action: "order.approve",
      user: "ana",
      from: "2026-11-10",
      to: "2026-11-14",
    })
    const args = auditFindMany.mock.calls[0]![0]
    expect(args.where).toEqual({
      entity: "order",
      action: { startsWith: "order.approve" },
      user: {
        OR: [{ email: { contains: "ana" } }, { name: { contains: "ana" } }],
      },
      createdAt: {
        gte: new Date("2026-11-10T03:00:00.000Z"),
        lte: new Date("2026-11-15T02:59:59.999Z"),
      },
    })
    expect(args.take).toBe(AUDIT_PAGE_SIZE + 1)
  })

  it("rejects an inverted period", async () => {
    const result = await auditActions.listAuditLogs({
      from: "2026-11-14",
      to: "2026-11-10",
    })
    expect(result).toEqual({
      success: false,
      error: "A data inicial deve ser anterior à final.",
    })
  })

  it("shows who, when, IP and the values, and pages", async () => {
    const createdAt = new Date("2026-11-14T15:00:00Z")
    auditFindMany.mockResolvedValue(
      Array.from({ length: AUDIT_PAGE_SIZE + 1 }, (_, index) => ({
        id: `a${index}`,
        createdAt,
        ipAddress: "192.168.0.20",
        action: "order.approve",
        entity: "order",
        entityId: "o1",
        before: { status: "AWAITING_APPROVAL" },
        after: null,
        user: index === 0 ? null : { name: "Ana", email: "ana@b" },
      }))
    )
    const result = await auditActions.listAuditLogs({ page: "2" })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.hasNext).toBe(true)
    expect(result.rows).toHaveLength(AUDIT_PAGE_SIZE)
    expect(result.rows[0]).toMatchObject({
      user: null,
      ipAddress: "192.168.0.20",
      createdAt: createdAt.toISOString(),
      after: null,
    })
    expect(JSON.parse(result.rows[0]!.before!)).toEqual({
      status: "AWAITING_APPROVAL",
    })
    expect(auditFindMany.mock.calls[0]![0].skip).toBe(AUDIT_PAGE_SIZE)
  })
})
