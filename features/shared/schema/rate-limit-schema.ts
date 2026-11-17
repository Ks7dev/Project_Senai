import { z } from "zod"

/**
 * Rate limit of a sensitive Server Action, stored in the `settings`
 * table (#175, PCI 8, RNF05): at most `limit` calls per window of
 * `windowMinutes`.
 */
export const rateLimitSettingSchema = z.object({
  limit: z.number().int().min(1).max(10_000),
  windowMinutes: z
    .number()
    .int()
    .min(1)
    .max(7 * 24 * 60),
})

/** A rate limit read from the settings table. */
export type RateLimitSetting = z.infer<typeof rateLimitSettingSchema>

/** What is being limited: the action and who or what is counted. */
export type RateLimitScope = "payment.order" | "payment.ip" | "refund.user"

/** Settings key of each rate limit scope. */
export const RATE_LIMIT_SETTING_KEYS: Record<RateLimitScope, string> = {
  "payment.order": "security.payment_attempts_per_order",
  "payment.ip": "security.payment_attempts_per_ip",
  "refund.user": "security.refund_requests_per_user",
}

/**
 * Values written by the seed for each scope. The code uses them only
 * when the setting is missing or invalid (logged as an error), so a
 * broken configuration never turns the limit off.
 */
export const DEFAULT_RATE_LIMITS: Record<RateLimitScope, RateLimitSetting> = {
  "payment.order": { limit: 5, windowMinutes: 60 },
  "payment.ip": { limit: 20, windowMinutes: 60 },
  "refund.user": { limit: 10, windowMinutes: 60 },
}
