import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { jar } from "./next-headers-stub"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { listInternalUsers, setInternalUserRoles } =
  await import("@/features/backoffice/internal-users/action/internal-users-actions")
const { loadUserPermissions } =
  await import("@/features/shared/lib/db/permissions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const admin = "admin@atelierbureau.test"
const customer = "cliente.pf@atelierbureau.test"

/**
 * Logs in with a seed account through the real sign-in action.
 *
 * @param email - Seed account e-mail.
 */
async function login(email: string) {
  jar.clear()
  expect(await signIn({ email, password })).toEqual({
    success: true,
    twoFactor: false,
  })
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: customer },
    select: { id: true },
  })
  await prisma.userRole.deleteMany({ where: { userId: user.id } })
  await prisma.auditLog.deleteMany({
    where: { action: "user.roles", entityId: user.id },
  })
  await prisma.$disconnect()
})

describe("internal users and profiles (#72, RF55)", () => {
  it("gives a profile to an existing account, audits it and removes it", async () => {
    await login(admin)
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customer },
      select: { id: true },
    })

    expect(
      await setInternalUserRoles({ email: customer, roles: ["stock"] })
    ).toEqual({ success: true })
    const granted = await loadUserPermissions(user.id)
    expect(granted.has("stock:update")).toBe(true)
    expect(granted.has("user:manage")).toBe(false)

    const list = await listInternalUsers()
    if (!list.success) throw new Error(list.error)
    expect(list.users.find((row) => row.email === customer)?.roles).toEqual([
      "stock",
    ])
    expect(list.roles.find((role) => role.key === "admin")?.managesUsers).toBe(
      true
    )
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "user.roles", entityId: user.id },
      orderBy: { createdAt: "desc" },
    })
    expect(audit.after).toEqual({ roles: ["stock"] })

    expect(await setInternalUserRoles({ email: customer, roles: [] })).toEqual({
      success: true,
    })
    expect((await loadUserPermissions(user.id)).size).toBe(0)
  })

  it("refuses unknown accounts, unknown profiles and self lockout", async () => {
    await login(admin)
    expect(
      (
        await setInternalUserRoles({
          email: "ninguem@atelierbureau.test",
          roles: ["sales"],
        })
      ).success
    ).toBe(false)
    expect(
      (await setInternalUserRoles({ email: customer, roles: ["inexistente"] }))
        .success
    ).toBe(false)
    const self = await setInternalUserRoles({ email: admin, roles: ["sales"] })
    expect(self.success).toBe(false)
    const me = await prisma.user.findUniqueOrThrow({
      where: { email: admin },
      select: { id: true },
    })
    expect((await loadUserPermissions(me.id)).has("user:manage")).toBe(true)
  })

  it("refuses users without the user:manage permission", async () => {
    await login("comercial@atelierbureau.test")
    expect((await listInternalUsers()).success).toBe(false)
    expect(
      (await setInternalUserRoles({ email: customer, roles: ["admin"] }))
        .success
    ).toBe(false)
  })
})
