import { z } from "zod"

/** Decisions a corporate approver may take on an order (RF11). */
export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED"] as const

/** Decision of the approver. */
export type ApprovalDecisionKey = (typeof APPROVAL_DECISIONS)[number]

/** Shortest justification accepted for a refusal. */
export const REJECTION_NOTE_MIN = 10

/** Longest justification stored. */
export const APPROVAL_NOTE_MAX = 1000

/**
 * Decision of the approver on an order above the approval limit (RF11,
 * RN01). The justification is required to refuse and optional to
 * approve; the same schema validates the form and the Server Action.
 */
export const orderApprovalSchema = z
  .object({
    orderId: z.uuid("Pedido inválido."),
    decision: z.enum(APPROVAL_DECISIONS, "Escolha aprovar ou recusar."),
    note: z
      .string("Informe a justificativa.")
      .trim()
      .max(
        APPROVAL_NOTE_MAX,
        `A justificativa pode ter até ${APPROVAL_NOTE_MAX} caracteres.`
      ),
  })
  .refine(
    (value) =>
      value.decision === "APPROVED" || value.note.length >= REJECTION_NOTE_MIN,
    {
      path: ["note"],
      message: `Explique o motivo da recusa (mínimo de ${REJECTION_NOTE_MIN} caracteres).`,
    }
  )

/** Values of the approval decision. */
export type OrderApprovalInput = z.input<typeof orderApprovalSchema>
