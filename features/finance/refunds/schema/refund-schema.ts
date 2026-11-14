import { z } from "zod"

/** Refund reasons, in the order shown in the form. */
export const REFUND_REASONS = [
  "CANCELLATION",
  "WITHDRAWAL",
  "EVALUATED_RETURN",
  "ADJUSTMENT",
] as const

/** Refund kinds. */
export const REFUND_KINDS = ["FULL", "PARTIAL"] as const

/** Filters of the refund list. */
export const REFUND_FILTERS = [
  "PENDING_APPROVAL",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "ALL",
] as const

/** A filter of the refund list. */
export type RefundFilter = (typeof REFUND_FILTERS)[number]

/** Shortest justification of a refund request. */
export const REFUND_NOTE_MIN = 10

/** Longest justification of a refund request. */
export const REFUND_NOTE_MAX = 500

/** Longest note of an approval or refusal. */
export const REFUND_DECISION_NOTE_MAX = 255

/** Lookup of the order to refund by its readable number. */
export const refundOrderLookupSchema = z.object({
  number: z
    .string("Informe o número do pedido.")
    .trim()
    .toUpperCase()
    .regex(/^AB-\d{4}-\d{6}$/, "Use o número do pedido, como AB-2026-000123."),
})

/** Lookup values. */
export type RefundOrderLookupInput = z.input<typeof refundOrderLookupSchema>

/**
 * Refund request (RF34): reason, full or partial, the partial amount and
 * the justification kept in the audit log (RNF12).
 */
export const refundRequestSchema = z
  .object({
    orderId: z.uuid("Pedido inválido."),
    reason: z.enum(REFUND_REASONS, "Escolha o motivo do estorno."),
    kind: z.enum(REFUND_KINDS, "Escolha estorno total ou parcial."),
    amount: z
      .string()
      .trim()
      // "1.234,56" (pt-BR) or "1234.56"
      .transform((value) =>
        value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value
      )
      .optional()
      .default(""),
    note: z
      .string("Explique o estorno.")
      .trim()
      .min(
        REFUND_NOTE_MIN,
        `Explique o estorno em pelo menos ${REFUND_NOTE_MIN} caracteres.`
      )
      .max(REFUND_NOTE_MAX, `Use no máximo ${REFUND_NOTE_MAX} caracteres.`),
  })
  .superRefine((value, ctx) => {
    if (value.kind !== "PARTIAL") return
    if (
      !/^\d{1,10}(\.\d{1,2})?$/.test(value.amount) ||
      Number(value.amount) <= 0
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Informe o valor do estorno parcial.",
      })
    }
  })
  .transform((value) => ({
    ...value,
    amount: value.kind === "PARTIAL" ? Number(value.amount).toFixed(2) : null,
  }))

/** Refund form values. */
export type RefundRequestInput = z.input<typeof refundRequestSchema>

/** Refund request after validation. */
export type RefundRequestData = z.output<typeof refundRequestSchema>

/** Approval of a refund waiting for the finance team (RN07). */
export const approveRefundSchema = z.object({
  refundId: z.uuid("Estorno inválido."),
  note: z
    .string()
    .trim()
    .max(
      REFUND_DECISION_NOTE_MAX,
      `Use no máximo ${REFUND_DECISION_NOTE_MAX} caracteres.`
    )
    .optional()
    .default(""),
})

/** Approval values. */
export type ApproveRefundInput = z.input<typeof approveRefundSchema>

/** Refusal of a refund, always with the reason (RN07). */
export const rejectRefundSchema = z.object({
  refundId: z.uuid("Estorno inválido."),
  note: z
    .string("Informe o motivo da recusa.")
    .trim()
    .min(5, "Informe o motivo da recusa.")
    .max(
      REFUND_DECISION_NOTE_MAX,
      `Use no máximo ${REFUND_DECISION_NOTE_MAX} caracteres.`
    ),
})

/** Refusal values. */
export type RejectRefundInput = z.input<typeof rejectRefundSchema>

/** New attempt of a refund Mercado Pago did not answer. */
export const retryRefundSchema = z.object({
  refundId: z.uuid("Estorno inválido."),
})

/** Retry values. */
export type RetryRefundInput = z.input<typeof retryRefundSchema>

/** Filter of the refund list. */
export const refundsFilterSchema = z.object({
  filter: z.enum(REFUND_FILTERS).optional().default("ALL"),
})

/** Filter values. */
export type RefundsFilterInput = z.input<typeof refundsFilterSchema>
