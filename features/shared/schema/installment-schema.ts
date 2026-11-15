import { z } from "zod"

/** Customer profiles the installment rules apply to (RF14). */
export const INSTALLMENT_PROFILES = ["PF", "PJ"] as const

/** A customer profile: person (PF) or company (PJ). */
export type InstallmentProfile = (typeof INSTALLMENT_PROFILES)[number]

/** Most installments Mercado Pago offers on a card in Brazil. */
export const MAX_CARD_INSTALLMENTS = 12

/**
 * One installment rule as stored in the settings table
 * (`payment.installment_rules`, RF14): from `minTotal` on, orders of
 * the profile may be split into up to `maxInstallments`.
 */
export const installmentRuleSchema = z.object({
  profile: z.enum(INSTALLMENT_PROFILES),
  minTotal: z.string().regex(/^\d{1,10}\.\d{2}$/),
  maxInstallments: z.number().int().min(1).max(MAX_CARD_INSTALLMENTS),
})

/** One installment rule. */
export type InstallmentRule = z.infer<typeof installmentRuleSchema>

/** Every installment rule (RF14). */
export const installmentRulesSchema = z.array(installmentRuleSchema).max(40)

/**
 * Most card installments allowed for an order (RF14): the rule of the
 * customer profile with the highest `minTotal` the order total reaches.
 * Without a matching rule the order is paid in a single installment.
 *
 * @param rules - Configured rules.
 * @param profile - Customer profile.
 * @param total - Order total, decimal string.
 * @returns The maximum number of installments (at least 1).
 */
export function maxInstallmentsFor(
  rules: readonly InstallmentRule[],
  profile: InstallmentProfile,
  total: string
): number {
  const cents = Math.round(Number(total) * 100)
  const match = rules
    .filter(
      (rule) =>
        rule.profile === profile &&
        Math.round(Number(rule.minTotal) * 100) <= cents
    )
    .sort((a, b) => Number(b.minTotal) - Number(a.minTotal))[0]
  return match ? match.maxInstallments : 1
}
