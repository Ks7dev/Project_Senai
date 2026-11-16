import { z } from "zod"
import {
  INSTALLMENT_PROFILES,
  MAX_CARD_INSTALLMENTS,
} from "@/features/shared/schema/installment-schema"

/**
 * Amount typed in the back office ("1.000,00", "1000,5" or "1000.50"),
 * normalized to a decimal string with 2 places.
 */
const moneyField = z
  .string("Informe o valor mínimo.")
  .trim()
  .transform((value) =>
    value.includes(",")
      ? value.replace(/\./g, "").replace(",", ".")
      : value.replace(/\s/g, "")
  )
  .pipe(
    z
      .string()
      .regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor inválido.")
      .transform((value) => Number(value).toFixed(2))
  )

const installmentsField = z.coerce
  .number("Informe o número de parcelas.")
  .int("Informe um número inteiro de parcelas.")
  .min(1, "O mínimo é 1 parcela.")
  .max(MAX_CARD_INSTALLMENTS, `O máximo é ${MAX_CARD_INSTALLMENTS} parcelas.`)

/** One installment range edited in the back office (RF14). */
export const installmentRuleFormSchema = z.object({
  profile: z.enum(INSTALLMENT_PROFILES, "Escolha o perfil do cliente."),
  minTotal: moneyField,
  maxInstallments: installmentsField,
})

/**
 * Every installment range (RF14). Each profile needs a range starting
 * at R$ 0,00, so any order has a rule, and two ranges of the same
 * profile cannot start at the same amount.
 */
export const installmentRulesFormSchema = z
  .object({
    rules: z
      .array(installmentRuleFormSchema)
      .min(1, "Cadastre ao menos uma faixa.")
      .max(40, "Use no máximo 40 faixas."),
  })
  .superRefine(({ rules }, context) => {
    for (const profile of INSTALLMENT_PROFILES) {
      const own = rules.filter((rule) => rule.profile === profile)
      if (!own.some((rule) => Number(rule.minTotal) === 0)) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `Cadastre uma faixa a partir de R$ 0,00 para ${profile === "PF" ? "pessoa física" : "pessoa jurídica"}.`,
        })
      }
      const starts = own.map((rule) => rule.minTotal)
      if (new Set(starts).size !== starts.length) {
        context.addIssue({
          code: "custom",
          path: ["rules"],
          message: `Há faixas repetidas para ${profile === "PF" ? "pessoa física" : "pessoa jurídica"}.`,
        })
      }
    }
  })

/** Installment form values. */
export type InstallmentRulesFormInput = z.input<
  typeof installmentRulesFormSchema
>

/** Installment values after validation. */
export type InstallmentRulesFormData = z.output<
  typeof installmentRulesFormSchema
>
