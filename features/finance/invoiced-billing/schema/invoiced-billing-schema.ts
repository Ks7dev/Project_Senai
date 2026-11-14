import { z } from "zod"

/** Filters of the receivables list. */
export const RECEIVABLE_FILTERS = [
  "OPEN",
  "OVERDUE",
  "PAID",
  "CANCELED",
  "ALL",
] as const

/** A filter of the receivables list. */
export type ReceivableFilter = (typeof RECEIVABLE_FILTERS)[number]

/** Settlement methods the finance team may record (RF33). */
export const SETTLEMENT_METHODS = ["MANUAL", "BANK_RETURN"] as const

/** Longest settlement note. */
export const SETTLEMENT_NOTE_MAX = 255

/** Filters of the receivables list: status and a free search. */
export const receivablesFilterSchema = z.object({
  filter: z.enum(RECEIVABLE_FILTERS).optional().default("OPEN"),
  search: z.string().trim().max(60).optional().default(""),
})

/** Receivables filter values. */
export type ReceivablesFilterInput = z.input<typeof receivablesFilterSchema>

/**
 * Settlement of an installment by the finance team (RF33): when it was
 * paid (date in São Paulo), how much (at least the installment amount;
 * a higher value covers late fees) and how it was confirmed.
 */
export const settleInstallmentSchema = z.object({
  installmentId: z.uuid("Parcela inválida."),
  paidAt: z
    .string("Informe a data do pagamento.")
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data do pagamento.")
    .refine(
      (value) => !Number.isNaN(new Date(`${value}T12:00:00-03:00`).getTime()),
      "Data do pagamento inválida."
    ),
  paidAmount: z
    .string("Informe o valor pago.")
    .trim()
    .min(1, "Informe o valor pago.")
    .transform((value) => value.replace(",", "."))
    .pipe(
      z
        .string()
        .regex(/^\d{1,10}(\.\d{1,2})?$/, "Valor pago inválido.")
        .transform((value) => Number(value).toFixed(2))
    ),
  method: z.enum(
    SETTLEMENT_METHODS,
    "Escolha como o pagamento foi confirmado."
  ),
  note: z
    .string()
    .trim()
    .max(
      SETTLEMENT_NOTE_MAX,
      `Use no máximo ${SETTLEMENT_NOTE_MAX} caracteres.`
    )
    .optional()
    .default(""),
})

/** Settlement form values. */
export type SettleInstallmentInput = z.input<typeof settleInstallmentSchema>

/** Settlement after validation. */
export type SettleInstallmentData = z.output<typeof settleInstallmentSchema>

/** Confirmation of an invoiced order waiting for the finance team (RN13). */
export const confirmInvoicedOrderSchema = z.object({
  orderId: z.uuid("Pedido inválido."),
})

/** Confirmation values. */
export type ConfirmInvoicedOrderInput = z.input<
  typeof confirmInvoicedOrderSchema
>
