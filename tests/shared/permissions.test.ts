import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  adminModules,
  hasPermission,
  PENDING_ADMIN_ROUTES,
  visibleAdminModules,
} from "@/features/shared/lib/auth/permissions"
import { permissions as seededPermissions, roles } from "@/prisma/seed-data"

const getCurrentUser = vi.fn()
const findMany = vi.fn()

vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: { rolePermission: { findMany: (args: unknown) => findMany(args) } },
}))

const { requirePermission, FORBIDDEN_MESSAGE, UNAUTHENTICATED_MESSAGE } =
  await import("@/features/shared/lib/db/permissions")

/**
 * Permission set of a seeded role.
 *
 * @param key - Role key.
 * @returns The role permissions.
 */
function rolePermissions(key: string): Set<string> {
  return new Set(roles.find((role) => role.key === key)!.permissions)
}

/**
 * Prisma rows returned for a list of "resource:action" keys.
 *
 * @param keys - Permission keys.
 * @returns Rows shaped like the rolePermission query.
 */
function rows(keys: string[]) {
  return keys.map((key) => {
    const index = key.lastIndexOf(":")
    return {
      permission: {
        resource: key.slice(0, index),
        action: key.slice(index + 1),
      },
    }
  })
}

describe("admin modules by profile (RF55)", () => {
  it("only references permissions that exist in the seed", () => {
    for (const item of adminModules) {
      expect(seededPermissions).toContain(item.permission)
    }
  })

  it("shows every delivered module to the administrator", () => {
    const visible = visibleAdminModules(rolePermissions("admin"))
    expect(visible).toHaveLength(
      adminModules.length - PENDING_ADMIN_ROUTES.size
    )
    expect(visible.map((m) => m.href)).toContain("/admin/usuarios")
    for (const item of visible) {
      expect(PENDING_ADMIN_ROUTES.has(item.href)).toBe(false)
    }
  })

  it("only marks existing modules as pending", () => {
    const hrefs = adminModules.map((m) => m.href)
    for (const href of PENDING_ADMIN_ROUTES) expect(hrefs).toContain(href)
  })

  it("keeps finance out of products and settings", () => {
    const labels = visibleAdminModules(rolePermissions("finance")).map(
      (m) => m.label
    )
    expect(labels).toContain("Pedidos")
    expect(labels).not.toContain("Produtos")
    expect(labels).not.toContain("Configurações")
  })

  it("shows the quotes module to sales and hides it from stock (#50)", () => {
    expect(PENDING_ADMIN_ROUTES.has("/admin/cotacoes")).toBe(false)
    const sales = rolePermissions("sales")
    expect(visibleAdminModules(sales).map((m) => m.href)).toContain(
      "/admin/cotacoes"
    )
    expect(hasPermission(sales, "quote:answer")).toBe(true)
    expect(
      visibleAdminModules(rolePermissions("stock")).map((m) => m.href)
    ).not.toContain("/admin/cotacoes")
  })

  it("gives stock and logistics the shipping module but not finance", () => {
    const granted = rolePermissions("stock")
    expect(hasPermission(granted, "shipment:manage")).toBe(true)
    expect(hasPermission(granted, "payment:refund")).toBe(false)
  })
})

describe("requirePermission (server check)", () => {
  beforeEach(() => {
    getCurrentUser.mockReset()
    findMany.mockReset()
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("rejects visitors without a session", async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requirePermission("order:read")).rejects.toMatchObject({
      code: "unauthenticated",
      publicMessage: UNAUTHENTICATED_MESSAGE,
    })
  })

  it("rejects users whose roles lack the permission", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", name: "A", email: "a@b" })
    findMany.mockResolvedValue(rows(["order:read"]))
    await expect(requirePermission("payment:refund")).rejects.toMatchObject({
      code: "forbidden",
      publicMessage: FORBIDDEN_MESSAGE,
    })
  })

  it("allows users whose roles grant the permission", async () => {
    getCurrentUser.mockResolvedValue({ id: "u1", name: "A", email: "a@b" })
    findMany.mockResolvedValue(rows(["order:read", "order:status:update"]))
    const result = await requirePermission("order:status:update")
    expect(result.user.id).toBe("u1")
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: { userRoles: { some: { userId: "u1" } } } },
      })
    )
  })
})
