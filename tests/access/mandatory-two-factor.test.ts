import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  requiresTwoFactor,
  TWO_FACTOR_REQUIRED_PERMISSIONS,
  twoFactorGate,
} from "@/features/shared/lib/auth/permissions"
import { permissions as seededPermissions, roles } from "@/prisma/seed-data"

const getCurrentUser = vi.fn()
const rolePermissionFindMany = vi.fn()
const memberFindFirst = vi.fn()
const redirect = vi.fn((path: string) => {
  throw new Error(`NEXT_REDIRECT:${path}`)
})
const api = {
  enableTwoFactor: vi.fn(),
  verifyTOTP: vi.fn(),
  disableTwoFactor: vi.fn(),
}

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => redirect(path),
  unstable_rethrow: () => {},
}))
vi.mock("@/features/shared/lib/auth/auth", () => ({ getAuth: () => ({ api }) }))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    rolePermission: {
      findMany: (args: unknown) => rolePermissionFindMany(args),
    },
    member: { findFirst: (args: unknown) => memberFindFirst(args) },
  },
}))

const {
  requireBackOfficeUser,
  requirePermission,
  TWO_FACTOR_SETUP_MESSAGE,
  TWO_FACTOR_VERIFY_MESSAGE,
} = await import("@/features/shared/lib/db/permissions")
const { requireBackOfficePage, requirePagePermission, TWO_FACTOR_SETUP_PATH } =
  await import("@/features/shared/lib/db/page-guard")
const { disableTwoFactor, getSecurityStatus, startTwoFactor } =
  await import("@/features/access/security/action/two-factor")

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
function rows(keys: readonly string[]) {
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

/**
 * Logged-in user with the given 2FA state.
 *
 * @param twoFactorEnabled - Whether 2FA is on.
 * @param twoFactorVerified - Whether the session passed the code.
 * @returns A session user.
 */
function sessionUser(twoFactorEnabled: boolean, twoFactorVerified: boolean) {
  return {
    id: "u1",
    name: "Usuário Interno Fictício",
    email: "interno@exemplo.test",
    twoFactorEnabled,
    twoFactorVerified,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  memberFindFirst.mockResolvedValue(null)
})

describe("permissions that make 2FA mandatory (#177)", () => {
  it("only lists permissions that exist in the seed", () => {
    for (const key of TWO_FACTOR_REQUIRED_PERMISSIONS) {
      expect(seededPermissions).toContain(key)
    }
  })

  it("covers orders, payments and refunds", () => {
    expect(TWO_FACTOR_REQUIRED_PERMISSIONS).toEqual(
      expect.arrayContaining([
        "order:read",
        "order:status:update",
        "order:cancel",
        "credit:approve",
        "payment:refund",
      ])
    )
  })

  it("requires 2FA for every seeded internal profile, all of them read orders", () => {
    for (const role of roles) {
      expect(requiresTwoFactor(rolePermissions(role.key))).toBe(true)
    }
  })

  it("does not require 2FA for profiles outside orders, payments and refunds", () => {
    expect(requiresTwoFactor(new Set(["product:read", "content:manage"]))).toBe(
      false
    )
    expect(requiresTwoFactor(new Set())).toBe(false)
  })

  it("asks for activation, then for a verified session", () => {
    const finance = rolePermissions("finance")
    expect(
      twoFactorGate(finance, {
        twoFactorEnabled: false,
        twoFactorVerified: false,
      })
    ).toBe("setup")
    expect(
      twoFactorGate(finance, {
        twoFactorEnabled: true,
        twoFactorVerified: false,
      })
    ).toBe("verify")
    expect(
      twoFactorGate(finance, {
        twoFactorEnabled: true,
        twoFactorVerified: true,
      })
    ).toBe("ok")
    expect(
      twoFactorGate(new Set(["product:read"]), {
        twoFactorEnabled: false,
        twoFactorVerified: false,
      })
    ).toBe("ok")
  })
})

describe("server enforcement of mandatory 2FA (#177)", () => {
  it("blocks a profile with refunds until 2FA is turned on", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(rows(["payment:refund"]))
    await expect(requirePermission("payment:refund")).rejects.toMatchObject({
      code: "two_factor_setup",
      publicMessage: TWO_FACTOR_SETUP_MESSAGE,
    })
  })

  it("blocks a session opened without the code even with 2FA on", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(true, false))
    rolePermissionFindMany.mockResolvedValue(rows(["order:read"]))
    await expect(requirePermission("order:read")).rejects.toMatchObject({
      code: "two_factor_verify",
      publicMessage: TWO_FACTOR_VERIFY_MESSAGE,
    })
  })

  it("applies to every module of a profile that requires 2FA", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(
      rows(["product:read", "order:read"])
    )
    await expect(requirePermission("product:read")).rejects.toMatchObject({
      code: "two_factor_setup",
    })
  })

  it("lets in a profile with 2FA verified in the session", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(true, true))
    rolePermissionFindMany.mockResolvedValue(rows(["order:cancel"]))
    const result = await requirePermission("order:cancel")
    expect(result.user.id).toBe("u1")
  })

  it("does not require 2FA from profiles outside the list", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(rows(["content:manage"]))
    const result = await requirePermission("content:manage")
    expect(result.permissions.has("content:manage")).toBe(true)
  })

  it("guards the back office home and menu too", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(rows(["order:read"]))
    await expect(requireBackOfficeUser()).rejects.toMatchObject({
      code: "two_factor_setup",
    })
    getCurrentUser.mockResolvedValue(null)
    await expect(requireBackOfficeUser()).rejects.toMatchObject({
      code: "unauthenticated",
    })
  })
})

describe("first access leads to the 2FA activation (#177)", () => {
  it("redirects back office pages to the activation page", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(rows(["order:read"]))
    await expect(
      requirePagePermission("order:read", "/admin/pedidos")
    ).rejects.toThrow(`NEXT_REDIRECT:${TWO_FACTOR_SETUP_PATH}`)
    await expect(requireBackOfficePage("/admin")).rejects.toThrow(
      `NEXT_REDIRECT:${TWO_FACTOR_SETUP_PATH}`
    )
    expect(TWO_FACTOR_SETUP_PATH).toBe("/conta/seguranca")
  })

  it("keeps the login and no-access redirects", async () => {
    getCurrentUser.mockResolvedValue(null)
    await expect(requireBackOfficePage("/admin")).rejects.toThrow(
      "NEXT_REDIRECT:/entrar?redirect=%2Fadmin"
    )
    getCurrentUser.mockResolvedValue(sessionUser(true, true))
    rolePermissionFindMany.mockResolvedValue(rows(["order:read"]))
    await expect(
      requirePagePermission("payment:refund", "/admin/financeiro")
    ).rejects.toThrow("NEXT_REDIRECT:/admin/sem-acesso")
  })

  it("lets an internal profile without a corporate account turn 2FA on", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue(rows(["order:read"]))
    api.enableTwoFactor.mockResolvedValue({
      method: "totp",
      totpURI: "otpauth://totp/Atelier?secret=ABC",
      backupCodes: ["code-1"],
    })
    expect(await getSecurityStatus()).toEqual({
      corporate: false,
      internal: true,
      required: true,
      twoFactorEnabled: false,
      sessionVerified: false,
    })
    expect(await startTwoFactor({ password: "senha-ficticia" })).toEqual({
      success: true,
      totpUri: "otpauth://totp/Atelier?secret=ABC",
      backupCodes: ["code-1"],
    })
  })

  it("does not let a required profile turn 2FA off", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(true, true))
    rolePermissionFindMany.mockResolvedValue(rows(["payment:refund"]))
    const result = await disableTwoFactor({ password: "senha-ficticia" })
    expect(result.success).toBe(false)
    expect(api.disableTwoFactor).not.toHaveBeenCalled()
  })

  it("still lets corporate customers turn 2FA off", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(true, true))
    rolePermissionFindMany.mockResolvedValue([])
    memberFindFirst.mockResolvedValue({ id: "m1" })
    api.disableTwoFactor.mockResolvedValue({ status: true })
    expect(await disableTwoFactor({ password: "senha-ficticia" })).toEqual({
      success: true,
    })
  })

  it("keeps 2FA closed to customers without a corporate account", async () => {
    getCurrentUser.mockResolvedValue(sessionUser(false, false))
    rolePermissionFindMany.mockResolvedValue([])
    const result = await startTwoFactor({ password: "senha-ficticia" })
    expect(result.success).toBe(false)
    expect(api.enableTwoFactor).not.toHaveBeenCalled()
  })
})
