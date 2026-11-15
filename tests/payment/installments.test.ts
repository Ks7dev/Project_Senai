import { describe, expect, it } from "vitest"
import { installmentRulesFormSchema } from "@/features/payment/installments/schema/installments-schema"
import {
  installmentRulesSchema,
  maxInstallmentsFor,
  type InstallmentRule,
} from "@/features/shared/schema/installment-schema"
import { settings } from "@/prisma/seed-data"

const rules: InstallmentRule[] = [
  { profile: "PF", minTotal: "0.00", maxInstallments: 1 },
  { profile: "PF", minTotal: "300.00", maxInstallments: 3 },
  { profile: "PF", minTotal: "1000.00", maxInstallments: 6 },
  { profile: "PJ", minTotal: "0.00", maxInstallments: 1 },
  { profile: "PJ", minTotal: "5000.00", maxInstallments: 10 },
]

describe("installments by amount and profile (#56, RF14)", () => {
  it("uses the highest range the order total reaches", () => {
    expect(maxInstallmentsFor(rules, "PF", "299.99")).toBe(1)
    expect(maxInstallmentsFor(rules, "PF", "300.00")).toBe(3)
    expect(maxInstallmentsFor(rules, "PF", "999.99")).toBe(3)
    expect(maxInstallmentsFor(rules, "PF", "15000.00")).toBe(6)
  })

  it("keeps the profiles apart", () => {
    expect(maxInstallmentsFor(rules, "PJ", "1000.00")).toBe(1)
    expect(maxInstallmentsFor(rules, "PJ", "5000.00")).toBe(10)
  })

  it("falls back to a single installment without a rule", () => {
    expect(maxInstallmentsFor([], "PF", "10000.00")).toBe(1)
  })

  it("seeds valid ranges for both profiles", () => {
    const seeded = settings.find(
      (setting) => setting.key === "payment.installment_rules"
    )
    const parsed = installmentRulesSchema.safeParse(seeded?.value)
    expect(parsed.success).toBe(true)
    expect(maxInstallmentsFor(parsed.data!, "PF", "0.00")).toBe(1)
    expect(maxInstallmentsFor(parsed.data!, "PJ", "0.00")).toBe(1)
  })
})

describe("installment ranges form (#56)", () => {
  const row = (profile: "PF" | "PJ", minTotal: string, max: string) => ({
    profile,
    minTotal,
    maxInstallments: max,
  })

  it("reads amounts typed in Portuguese", () => {
    const parsed = installmentRulesFormSchema.safeParse({
      rules: [
        row("PF", "0", "1"),
        row("PF", "1.500,50", "6"),
        row("PJ", "0,00", "1"),
      ],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.rules[1]).toEqual({
      profile: "PF",
      minTotal: "1500.50",
      maxInstallments: 6,
    })
  })

  it("requires a range from zero for each profile", () => {
    const parsed = installmentRulesFormSchema.safeParse({
      rules: [row("PF", "0", "1"), row("PJ", "100", "2")],
    })
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues[0]?.message).toBe(
      "Cadastre uma faixa a partir de R$ 0,00 para pessoa jurídica."
    )
  })

  it("refuses repeated ranges and more than 12 installments", () => {
    expect(
      installmentRulesFormSchema.safeParse({
        rules: [
          row("PF", "0", "1"),
          row("PF", "0,00", "2"),
          row("PJ", "0", "1"),
        ],
      }).success
    ).toBe(false)
    expect(
      installmentRulesFormSchema.safeParse({
        rules: [row("PF", "0", "13"), row("PJ", "0", "1")],
      }).success
    ).toBe(false)
  })
})
