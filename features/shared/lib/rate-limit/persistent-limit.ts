import "server-only"
import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"
import { getSetting } from "@/features/shared/lib/settings/settings"
import {
  DEFAULT_RATE_LIMITS,
  RATE_LIMIT_SETTING_KEYS,
  rateLimitSettingSchema,
  type RateLimitScope,
  type RateLimitSetting,
} from "@/features/shared/schema/rate-limit-schema"

/**
 * Generic message shown when a payment or refund is refused by the
 * rate limit (#175). It never says which limit was hit (RNF05).
 */
export const RATE_LIMITED_MESSAGE =
  "Muitas tentativas em pouco tempo. Por segurança, aguarde alguns minutos e tente novamente."

/** One minute, in milliseconds. */
const MINUTE = 60_000

/** One counted subject: the scope and the order id, IP or user id. */
export type RateLimitCheck = {
  /** What is limited. */
  scope: RateLimitScope
  /** Who or what is counted (order id, client IP or user id). */
  subject: string
}

/** Outcome of one counted call. */
export type PersistentLimitResult = {
  /** Whether the call may go through. */
  allowed: boolean
  /** Calls counted in the current window, this one included. */
  hits: number
  /** Whether this is the first refused call of the window. */
  firstRefusal: boolean
  /** Seconds until the window ends (0 when allowed). */
  retryAfterSeconds: number
}

/** Prisma client or transaction able to count calls. */
type LimitClient = Pick<Prisma.TransactionClient, "rateLimitBucket">

/**
 * Start of the fixed window that holds `nowMs`.
 *
 * @param nowMs - Current time, in milliseconds.
 * @param windowMs - Window size, in milliseconds.
 * @returns The window start (UTC).
 */
export function windowStartFor(nowMs: number, windowMs: number): Date {
  return new Date(nowMs - (nowMs % windowMs))
}

/**
 * Hash of the bucket key, so no IP or id is stored in clear (LGPD).
 *
 * @param scope - What is limited.
 * @param subject - Who or what is counted.
 * @returns SHA-256 hex digest.
 */
export function rateLimitKeyHash(
  scope: RateLimitScope,
  subject: string
): string {
  return createHash("sha256").update(`${scope}:${subject}`).digest("hex")
}

/**
 * Reads the limit of a scope from the settings table. A missing or
 * invalid value is logged and replaced by the seeded default, so a
 * broken configuration never turns the limit off.
 *
 * @param scope - What is limited.
 * @param client - Prisma client or transaction.
 * @returns The limit and window.
 */
export async function loadRateLimit(
  scope: RateLimitScope,
  client: Pick<Prisma.TransactionClient, "setting"> = prisma
): Promise<RateLimitSetting> {
  const key = RATE_LIMIT_SETTING_KEYS[scope]
  try {
    const parsed = rateLimitSettingSchema.safeParse(
      await getSetting(key, client)
    )
    if (parsed.success) return parsed.data
    logger.error("invalid rate limit setting", { key })
  } catch {
    logger.error("rate limit setting missing", { key })
  }
  return DEFAULT_RATE_LIMITS[scope]
}

/**
 * Whether a Prisma error is a duplicate key (two first calls of the
 * same window at once).
 *
 * @param error - The caught error.
 * @returns True for P2002.
 */
function isDuplicateKey(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002"
}

/**
 * Counts one call in a fixed window stored in the database. The row
 * survives restarts and the increment is atomic (`hits = hits + 1`), so
 * concurrent calls are never lost.
 *
 * @param input - Scope, subject, limit and current time.
 * @param client - Prisma client or transaction.
 * @returns Whether the call is allowed.
 */
export async function hitPersistentLimit(
  input: {
    scope: RateLimitScope
    subject: string
    rule: RateLimitSetting
    now: Date
  },
  client: LimitClient = prisma
): Promise<PersistentLimitResult> {
  const windowMs = input.rule.windowMinutes * MINUTE
  const windowStart = windowStartFor(input.now.getTime(), windowMs)
  const expiresAt = new Date(windowStart.getTime() + windowMs)
  const keyHash = rateLimitKeyHash(input.scope, input.subject)
  const where = { keyHash_windowStart: { keyHash, windowStart } }
  const increment = () =>
    client.rateLimitBucket.update({
      where,
      data: { hits: { increment: 1 } },
      select: { hits: true },
    })

  let row: { hits: number }
  try {
    row = await client.rateLimitBucket.upsert({
      where,
      create: { keyHash, windowStart, scope: input.scope, hits: 1, expiresAt },
      update: { hits: { increment: 1 } },
      select: { hits: true },
    })
  } catch (error) {
    if (!isDuplicateKey(error)) throw error
    row = await increment()
  }

  const allowed = row.hits <= input.rule.limit
  return {
    allowed,
    hits: row.hits,
    firstRefusal: row.hits === input.rule.limit + 1,
    retryAfterSeconds: allowed
      ? 0
      : Math.max(
          1,
          Math.ceil((expiresAt.getTime() - input.now.getTime()) / 1000)
        ),
  }
}

/**
 * Applies the rate limits of a payment or refund Server Action (#175,
 * PCI 8, RNF05). Each check is counted in the database; the first one
 * over its limit refuses the call with a generic message. Every refusal
 * is logged; the first one of each window also writes the audit log
 * (RNF12) with the user, the IP and the scope, so a blocked attacker
 * does not flood it.
 *
 * @param checks - Scopes and subjects to count, in order.
 * @param context - Session user, action name and affected row.
 * @throws AppError("rate_limited") when a limit is exceeded.
 */
export async function enforcePersistentRateLimits(
  checks: RateLimitCheck[],
  context: { userId: string | null; action: string; entityId?: string }
): Promise<void> {
  const now = new Date()
  for (const check of checks) {
    const rule = await loadRateLimit(check.scope)
    const result = await hitPersistentLimit({ ...check, rule, now })
    if (result.allowed) continue

    logger.warn("rate limit exceeded", {
      scope: check.scope,
      action: context.action,
      retryAfterSeconds: result.retryAfterSeconds,
    })
    if (result.firstRefusal) {
      await prisma.$transaction((tx) =>
        writeAudit(tx, {
          userId: context.userId,
          action: "security.rate_limited",
          entity: "rate_limit",
          entityId: context.entityId,
          after: {
            scope: check.scope,
            action: context.action,
            limit: rule.limit,
            windowMinutes: rule.windowMinutes,
          },
        })
      )
    }
    throw new AppError(RATE_LIMITED_MESSAGE, "rate_limited")
  }
}

/**
 * Deletes the buckets whose window has ended, run by a background job.
 *
 * @param now - Current time.
 * @param client - Prisma client or transaction.
 * @returns How many rows were deleted.
 */
export async function pruneRateLimitBuckets(
  now: Date = new Date(),
  client: LimitClient = prisma
): Promise<number> {
  const result = await client.rateLimitBucket.deleteMany({
    where: { expiresAt: { lt: now } },
  })
  return result.count
}
