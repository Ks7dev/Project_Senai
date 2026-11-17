import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  DEFAULT_RATE_LIMITS,
  rateLimitSettingSchema,
} from "@/features/shared/schema/rate-limit-schema"

type Bucket = {
  keyHash: string
  windowStart: Date
  scope: string
  hits: number
  expiresAt: Date
}

/** Rows of the fake `rate_limit_buckets` table. */
const buckets = new Map<string, Bucket>()
/** Values of the fake `settings` table. */
const settings = new Map<string, unknown>()

type BucketWhere = {
  keyHash_windowStart: { keyHash: string; windowStart: Date }
}

/**
 * Key of a bucket in the fake table.
 *
 * @param where - Compound id.
 * @returns The map key.
 */
function id(where: BucketWhere): string {
  const { keyHash, windowStart } = where.keyHash_windowStart
  return `${keyHash}|${windowStart.toISOString()}`
}

/** Fake Prisma: the same object is the client and the transaction. */
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
    upsert: vi.fn(
      async (args: { where: BucketWhere; create: Bucket; update: unknown }) => {
        const row = buckets.get(id(args.where))
        if (row) {
          row.hits += 1
          return { hits: row.hits }
        }
        buckets.set(id(args.where), { ...args.create })
        return { hits: args.create.hits }
      }
    ),
    update: vi.fn(async (args: { where: BucketWhere }) => {
      const row = buckets.get(id(args.where))
      if (!row) throw new Error("not found")
      row.hits += 1
      return { hits: row.hits }
    }),
    deleteMany: vi.fn(async (args: { where: { expiresAt: { lt: Date } } }) => {
      let count = 0
      for (const [key, row] of buckets) {
        if (row.expiresAt < args.where.expiresAt.lt) {
          buckets.delete(key)
          count += 1
        }
      }
      return { count }
    }),
  },
}

vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/request/client-ip", () => ({
  getClientIp: async () => "203.0.113.7",
}))

const {
  enforcePersistentRateLimits,
  hitPersistentLimit,
  loadRateLimit,
  pruneRateLimitBuckets,
  rateLimitKeyHash,
  RATE_LIMITED_MESSAGE,
  windowStartFor,
} = await import("@/features/shared/lib/rate-limit/persistent-limit")

const MINUTE = 60_000
const now = new Date("2026-11-17T12:10:00.000Z")

beforeEach(() => {
  buckets.clear()
  settings.clear()
  settings.set("security.payment_attempts_per_order", {
    limit: 3,
    windowMinutes: 60,
  })
  settings.set("security.payment_attempts_per_ip", {
    limit: 5,
    windowMinutes: 60,
  })
  settings.set("security.refund_requests_per_user", {
    limit: 2,
    windowMinutes: 30,
  })
  db.auditLog.create.mockClear()
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("rate limit settings (#175)", () => {
  it("accepts the seeded defaults and refuses broken values", () => {
    for (const value of Object.values(DEFAULT_RATE_LIMITS)) {
      expect(rateLimitSettingSchema.safeParse(value).success).toBe(true)
    }
    expect(
      rateLimitSettingSchema.safeParse({ limit: 0, windowMinutes: 60 }).success
    ).toBe(false)
    expect(rateLimitSettingSchema.safeParse({ limit: 5 }).success).toBe(false)
  })

  it("reads the limit from the settings table", async () => {
    await expect(loadRateLimit("refund.user")).resolves.toEqual({
      limit: 2,
      windowMinutes: 30,
    })
  })

  it("falls back to the seeded default when the setting is missing or invalid", async () => {
    settings.delete("security.payment_attempts_per_ip")
    await expect(loadRateLimit("payment.ip")).resolves.toEqual(
      DEFAULT_RATE_LIMITS["payment.ip"]
    )
    settings.set("security.payment_attempts_per_order", { limit: "x" })
    await expect(loadRateLimit("payment.order")).resolves.toEqual(
      DEFAULT_RATE_LIMITS["payment.order"]
    )
  })
})

describe("persistent fixed window limiter (#175)", () => {
  it("aligns the window and hashes the key, never storing it in clear", () => {
    expect(windowStartFor(now.getTime(), 60 * MINUTE).toISOString()).toBe(
      "2026-11-17T12:00:00.000Z"
    )
    const hash = rateLimitKeyHash("payment.ip", "203.0.113.7")
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain("203.0.113.7")
    expect(rateLimitKeyHash("payment.order", "203.0.113.7")).not.toBe(hash)
  })

  it("allows up to the limit, then refuses until the window ends", async () => {
    const input = {
      scope: "payment.order" as const,
      subject: "order-1",
      rule: { limit: 2, windowMinutes: 60 },
      now,
    }
    expect((await hitPersistentLimit(input)).allowed).toBe(true)
    expect((await hitPersistentLimit(input)).allowed).toBe(true)
    const third = await hitPersistentLimit(input)
    expect(third).toEqual({
      allowed: false,
      hits: 3,
      firstRefusal: true,
      retryAfterSeconds: 50 * 60,
    })
    const fourth = await hitPersistentLimit(input)
    expect(fourth.allowed).toBe(false)
    expect(fourth.firstRefusal).toBe(false)

    const nextWindow = new Date("2026-11-17T13:00:00.000Z")
    expect(
      (await hitPersistentLimit({ ...input, now: nextWindow })).allowed
    ).toBe(true)
  })

  it("counts each subject on its own", async () => {
    const rule = { limit: 1, windowMinutes: 60 }
    const base = { scope: "payment.order" as const, rule, now }
    expect((await hitPersistentLimit({ ...base, subject: "a" })).allowed).toBe(
      true
    )
    expect((await hitPersistentLimit({ ...base, subject: "b" })).allowed).toBe(
      true
    )
    expect((await hitPersistentLimit({ ...base, subject: "a" })).allowed).toBe(
      false
    )
  })

  it("increments when a concurrent first call created the row", async () => {
    const rule = { limit: 5, windowMinutes: 60 }
    await hitPersistentLimit({ scope: "refund.user", subject: "u", rule, now })
    db.rateLimitBucket.upsert.mockRejectedValueOnce({ code: "P2002" })
    const result = await hitPersistentLimit({
      scope: "refund.user",
      subject: "u",
      rule,
      now,
    })
    expect(result.hits).toBe(2)
    expect(db.rateLimitBucket.update).toHaveBeenCalled()
  })

  it("deletes only the windows that already ended", async () => {
    const rule = { limit: 5, windowMinutes: 60 }
    await hitPersistentLimit({ scope: "refund.user", subject: "u", rule, now })
    expect(await pruneRateLimitBuckets(now)).toBe(0)
    expect(
      await pruneRateLimitBuckets(new Date("2026-11-17T13:00:00.001Z"))
    ).toBe(1)
    expect(buckets.size).toBe(0)
  })
})

describe("enforcePersistentRateLimits (#175)", () => {
  const context = {
    userId: "user-1",
    action: "payOrder",
    entityId: "order-1",
  }

  it("refuses payment attempts per order with a generic message, audited once", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] })
    const checks = [
      { scope: "payment.order" as const, subject: "order-1" },
      { scope: "payment.ip" as const, subject: "203.0.113.7" },
    ]
    for (let i = 0; i < 3; i += 1) {
      await expect(
        enforcePersistentRateLimits(checks, context)
      ).resolves.toBeUndefined()
    }
    await expect(
      enforcePersistentRateLimits(checks, context)
    ).rejects.toMatchObject({
      publicMessage: RATE_LIMITED_MESSAGE,
      code: "rate_limited",
    })
    await expect(
      enforcePersistentRateLimits(checks, context)
    ).rejects.toMatchObject({ code: "rate_limited" })

    expect(db.auditLog.create).toHaveBeenCalledTimes(1)
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        action: "security.rate_limited",
        entity: "rate_limit",
        entityId: "order-1",
        ipAddress: "203.0.113.7",
        after: {
          scope: "payment.order",
          action: "payOrder",
          limit: 3,
          windowMinutes: 60,
        },
      }),
    })
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("rate limit exceeded")
    )
  })

  it("refuses payment attempts per IP across different orders", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] })
    for (let i = 0; i < 5; i += 1) {
      await enforcePersistentRateLimits(
        [
          { scope: "payment.order", subject: `order-${i}` },
          { scope: "payment.ip", subject: "203.0.113.7" },
        ],
        context
      )
    }
    await expect(
      enforcePersistentRateLimits(
        [
          { scope: "payment.order", subject: "order-new" },
          { scope: "payment.ip", subject: "203.0.113.7" },
        ],
        context
      )
    ).rejects.toMatchObject({ code: "rate_limited" })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        after: expect.objectContaining({ scope: "payment.ip" }),
      }),
    })
  })

  it("refuses refund requests per user", async () => {
    vi.useFakeTimers({ now, toFake: ["Date"] })
    const checks = [{ scope: "refund.user" as const, subject: "finance-1" }]
    const refundContext = { userId: "finance-1", action: "requestRefund" }
    await enforcePersistentRateLimits(checks, refundContext)
    await enforcePersistentRateLimits(checks, refundContext)
    await expect(
      enforcePersistentRateLimits(checks, refundContext)
    ).rejects.toMatchObject({ publicMessage: RATE_LIMITED_MESSAGE })
    await expect(
      enforcePersistentRateLimits(
        [{ scope: "refund.user", subject: "finance-2" }],
        { userId: "finance-2", action: "requestRefund" }
      )
    ).resolves.toBeUndefined()
  })
})
