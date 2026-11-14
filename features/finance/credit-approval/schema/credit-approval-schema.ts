import { z } from "zod"

/** Statuses the finance team may set on a corporate account (RF58). */
export const CREDIT_DECISIONS = ["APPROVED", "REJECTED", "PENDING"] as const

/** A credit decision of the finance team. */
export type CreditDecision = (typeof CREDIT_DECISIONS)[number]

/** Longest justification stored in the history. */
export const CREDIT_NOTE_MAX = 255

/** Highest credit limit accepted, in reais (fits DECIMAL(12,2)). */
export const CREDIT_LIMIT_MAX = 9_999_999_999.99

/**
 * Credit decision of the finance team on a corporate account (RF58,
 * RN10): approve with a limit, refuse with a justification or put the
 * account back under review. The limit is typed as "50000,00" or
 * "50000.00" and normalized to a decimal string; it only exists for an
 * approved account.
 */
export const updateCreditSchema = z
  .object({
    organizationId: z.string().trim().min(1, "Conta inválida.").max(36),
    status: z.enum(CREDIT_DECISIONS, "Escolha a decisão."),
    limit: z
      .string()
      .trim()
      .optional()
      .default("")
      .transform((value) => value.replace(",", ".")),
    note: z
      .string()
      .trim()
      .max(CREDIT_NOTE_MAX, `Use no máximo ${CREDIT_NOTE_MAX} caracteres.`)
      .optional()
      .default(""),
  })
  .superRefine((data, ctx) => {
    if (data.status === "APPROVED") {
      if (!/^\d{1,10}(\.\d{1,2})?$/.test(data.limit)) {
        ctx.addIssue({
          code: "custom",
          path: ["limit"],
          message: "Informe o limite de crédito, por exemplo 50000,00.",
        })
      } else if (Number(data.limit) <= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["limit"],
          message: "O limite de crédito precisa ser maior que zero.",
        })
      } else if (Number(data.limit) > CREDIT_LIMIT_MAX) {
        ctx.addIssue({
          code: "custom",
          path: ["limit"],
          message: "Limite de crédito acima do permitido.",
        })
      }
    }
    if (data.status === "REJECTED" && data.note.length < 10) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explique o motivo da recusa (mínimo de 10 caracteres).",
      })
    }
  })
  .transform((data) => ({
    organizationId: data.organizationId,
    status: data.status,
    limit: data.status === "APPROVED" ? Number(data.limit).toFixed(2) : null,
    note: data.note,
  }))

/** Credit decision form values. */
export type UpdateCreditInput = z.input<typeof updateCreditSchema>

/** Credit decision after validation. */
export type UpdateCreditData = z.output<typeof updateCreditSchema>
