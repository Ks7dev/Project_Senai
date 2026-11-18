import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { APIError } from "better-auth/api"

type Bucket = { scope: string; hits: number; expiresAt: Date }
type BucketWhere = {
  keyHash_windowStart: { keyHash: string; windowStart: Date }
}

/** Rows of the fake `rate_limit_buckets` table. */
const buckets = new Map<string, Bucket>()
/** Values of the fake `settings` table. */
const settings = new Map<string, unknown>()

/**
 * Key of a bucket in the fake table.
 *
 * @param keyHash - Hash of scope and subject.
 * @param windowStart - Window start.
 * @returns The map key.
 */
function id(keyHash: string, windowStart: Date): string {
  return `${keyHash}|${windowStart.toISOString()}`
}

/** Fake Prisma with the atomic counter used by the limiter. */
const db = {
  $transaction: vi.fn((run: (client: unknown) => unknown) => run(db)),
  setting: {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
      settings.has(where.key)
        ? { key: where.key, value: settings.get(where.key) }
        : null
    ),
  },
  auditLog: { create: vi.fn() },
  rateLimitBucket: {
    upsert: vi.fn(async (args: { where: BucketWhere; create: Bucket }) => {
      const { keyHash, windowStart } = args.where.keyHash_windowStart
      const row = buckets.get(id(keyHash, windowStart))
      if (row) {
        row.hits += 1
        return { hits: row.hits }
      }
      buckets.set(id(keyHash, windowStart), { ...args.create })
      return { hits: args.create.hits }
    }),
    updateMany: vi.fn(
      async (args: {
        where: { keyHash: string; windowStart: Date; hits: { gt: number } }
      }) => {
        const row = buckets.get(id(args.where.keyHash, args.where.windowStart))
        if (!row || row.hits <= args.where.hits.gt) return { count: 0 }
        row.hits -= 1
        return { count: 1 }
      }
    ),
  },
}

const api = { signInEmail: vi.fn(), verifyTOTP: vi.fn() }
let cookieHeader = ""

vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(cookieHeader ? { cookie: cookieHeader } : {}),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/request/client-ip", () => ({
  getClientIp: async () => "203.0.113.7",
}))
vi.mock("@/features/shared/lib/auth/auth", () => ({ getAuth: () => ({ api }) }))
vi.mock("@/features/shared/lib/cart/cart-store", () => ({
  mergeGuestCartAfterLogin: vi.fn(async () => undefined),
}))

const { signIn, verifyTwoFactor } =
  await import("@/features/access/sign-in/action/sign-in")
const { RATE_LIMITED_MESSAGE, rateLimitKeyHash, releasePersistentRateLimit } =
  await import("@/features/shared/lib/rate-limit/persistent-limit")

const now = new Date("2026-11-18T12:10:00.000Z")
const victim = "financeiro@atelierbureau.test"

beforeEach(() => {
  vi.useFakeTimers({ now, toFake: ["Date"] })
  buckets.clear()
  settings.clear()
  settings.set("security.sign_in_attempts_per_account", {
    limit: 5,
    windowMinutes: 15,
  })
  settings.set("security.two_factor_attempts_per_challenge", {
    limit: 3,
    windowMinutes: 15,
  })
  cookieHeader = ""
  db.auditLog.create.mockClear()
  api.signInEmail.mockReset()
  api.verifyTOTP.mockReset()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("signIn limit per account (SEC-005, #220)", () => {
  it("blocks the e-mail after the failures, whatever the case or spaces", async () => {
    api.signInEmail.mockRejectedValue(new APIError("UNAUTHORIZED"))
    const emails = [
      victim,
      ` ${victim.toUpperCase()} `,
      "Financeiro@AtelierBureau.test",
    ]
    for (let i = 0; i < 5; i += 1) {
      expect(
        await signIn({ email: emails[i % 3], password: `errada-${i}` })
      ).toEqual({ success: false, error: "E-mail ou senha incorretos." })
    }

    // The right password no longer helps: the account is locked
    api.signInEmail.mockResolvedValue({ user: { id: "user-1" } })
    expect(await signIn({ email: victim, password: "senha-certa" })).toEqual({
      success: false,
      error: RATE_LIMITED_MESSAGE,
    })
    expect(api.signInEmail).toHaveBeenCalledTimes(5)
    expect(db.auditLog.create).toHaveBeenCalledTimes(1)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: null,
        action: "security.rate_limited",
        ipAddress: "203.0.113.7",
        after: expect.objectContaining({
          scope: "auth.account",
          action: "signIn",
        }),
      }),
    })
  })

  it("gives the same answer for an e-mail that has no account", async () => {
    api.signInEmail.mockRejectedValue(new APIError("UNAUTHORIZED"))
    for (let i = 0; i < 5; i += 1) {
      await signIn({ email: "nao@existe.test", password: "x" })
    }
    expect(await signIn({ email: "nao@existe.test", password: "x" })).toEqual({
      success: false,
      error: RATE_LIMITED_MESSAGE,
    })
  })

  it("does not count logins with the right password", async () => {
    api.signInEmail.mockResolvedValue({ twoFactorRedirect: true })
    for (let i = 0; i < 8; i += 1) {
      expect(await signIn({ email: victim, password: "senha-certa" })).toEqual({
        success: true,
        twoFactor: true,
      })
    }
  })

  it("keeps other accounts untouched", async () => {
    api.signInEmail.mockRejectedValue(new APIError("UNAUTHORIZED"))
    for (let i = 0; i < 6; i += 1) {
      await signIn({ email: victim, password: "x" })
    }
    api.signInEmail.mockResolvedValue({ twoFactorRedirect: false })
    expect(
      await signIn({ email: "outro@atelierbureau.test", password: "y" })
    ).toEqual({ success: true, twoFactor: false })
  })

  it("stores only the hash of the e-mail", async () => {
    api.signInEmail.mockRejectedValue(new APIError("UNAUTHORIZED"))
    await signIn({ email: victim, password: "x" })
    const keys = [...buckets.keys()].join(" ")
    expect(keys).not.toContain("@")
    expect(keys).toContain(rateLimitKeyHash("auth.account", victim))
  })
})

describe("verifyTwoFactor limit per challenge (SEC-005, #220)", () => {
  it("blocks the challenge after the attempts, with the code never checked", async () => {
    cookieHeader = "__Secure-better-auth.two_factor=challenge-1.signature"
    api.verifyTOTP.mockRejectedValue(new APIError("UNAUTHORIZED"))
    for (let i = 0; i < 3; i += 1) {
      expect(await verifyTwoFactor({ code: "000000" })).toMatchObject({
        success: false,
      })
    }
    expect(await verifyTwoFactor({ code: "123456" })).toEqual({
      success: false,
      error: RATE_LIMITED_MESSAGE,
    })
    expect(api.verifyTOTP).toHaveBeenCalledTimes(3)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: expect.objectContaining({
          scope: "auth.totp",
          action: "verifyTwoFactor",
        }),
      }),
    })
  })

  it("reads the plain cookie name in development", async () => {
    cookieHeader = "other=1; better-auth.two_factor=challenge-2.signature"
    api.verifyTOTP.mockRejectedValue(new APIError("UNAUTHORIZED"))
    for (let i = 0; i < 4; i += 1) await verifyTwoFactor({ code: "000000" })
    expect(api.verifyTOTP).toHaveBeenCalledTimes(3)
  })

  it("leaves a request without the cookie to Better Auth", async () => {
    api.verifyTOTP.mockRejectedValue(new APIError("UNAUTHORIZED"))
    await verifyTwoFactor({ code: "000000" })
    expect(buckets.size).toBe(0)
    expect(api.verifyTOTP).toHaveBeenCalledTimes(1)
  })
})

describe("releasePersistentRateLimit (SEC-005)", () => {
  it("never goes below zero and ignores a missing window", async () => {
    await releasePersistentRateLimit({ scope: "auth.account", subject: "a" })
    expect(buckets.size).toBe(0)
  })

  it("only logs when the database fails", async () => {
    db.rateLimitBucket.updateMany.mockRejectedValueOnce(new Error("down"))
    await expect(
      releasePersistentRateLimit({ scope: "auth.account", subject: "a" })
    ).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("rate limit release failed")
    )
  })
})
