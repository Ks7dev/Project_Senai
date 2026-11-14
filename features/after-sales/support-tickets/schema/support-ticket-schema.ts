import { z } from "zod"
import {
  TICKET_DESCRIPTION_MIN,
  TICKET_MESSAGE_MAX,
  TICKET_SUBJECT_MAX,
  TICKET_SUBJECT_MIN,
} from "@/features/shared/lib/support/ticket-format"
import {
  RETURN_REASONS,
  requiresReturnReason,
} from "@/features/shared/lib/support/return-policy"
import { TICKET_KINDS } from "@/features/shared/lib/support/ticket-status"

/** Query string of the new ticket page: preselected order and item. */
export const ticketFormSourceSchema = z.object({
  /** Order id, when the customer came from the order page. */
  pedido: z.uuid().optional().catch(undefined),
  /** Order item id. */
  item: z.uuid().optional().catch(undefined),
  /** Preselected kind: "troca", "devolucao" or "arrependimento". */
  tipo: z
    .enum(["troca", "devolucao", "arrependimento"])
    .optional()
    .catch(undefined),
})

/** Values of the new ticket page query string. */
export type TicketFormSource = z.input<typeof ticketFormSourceSchema>

/** Subject stored for a withdrawal the customer did not summarize. */
export const WITHDRAWAL_DEFAULT_SUBJECT = "Arrependimento da compra"

/**
 * New after-sales ticket (RF17, RN12, RN22): the order and the item it
 * refers to, the kind, the reason of an exchange or return, a subject
 * and the description of the problem. The withdrawal right needs no
 * justification, so its subject and description are optional. Photos
 * travel as files next to it.
 */
export const openTicketSchema = z
  .object({
    orderId: z.uuid("Escolha o pedido."),
    orderItemId: z.uuid("Escolha o produto do pedido."),
    kind: z.enum(TICKET_KINDS, "Escolha o tipo de chamado."),
    /** Exchanges and returns only: why the customer asks (RN12). */
    returnReason: z.enum(RETURN_REASONS).or(z.literal("")).default(""),
    subject: z
      .string()
      .trim()
      .max(
        TICKET_SUBJECT_MAX,
        `Use no máximo ${TICKET_SUBJECT_MAX} caracteres.`
      ),
    description: z
      .string()
      .trim()
      .max(
        TICKET_MESSAGE_MAX,
        `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`
      ),
  })
  .superRefine((value, context) => {
    if (requiresReturnReason(value.kind) && !value.returnReason) {
      context.addIssue({
        code: "custom",
        path: ["returnReason"],
        message: "Escolha o motivo da troca ou devolução.",
      })
    }
    if (value.kind === "WITHDRAWAL") return
    if (value.subject.length < TICKET_SUBJECT_MIN) {
      context.addIssue({
        code: "custom",
        path: ["subject"],
        message: `Resuma o problema em pelo menos ${TICKET_SUBJECT_MIN} caracteres.`,
      })
    }
    if (value.description.length < TICKET_DESCRIPTION_MIN) {
      context.addIssue({
        code: "custom",
        path: ["description"],
        message: `Descreva o problema em pelo menos ${TICKET_DESCRIPTION_MIN} caracteres.`,
      })
    }
  })
  .transform((value) => ({
    ...value,
    returnReason: requiresReturnReason(value.kind)
      ? value.returnReason || null
      : null,
    subject:
      value.kind === "WITHDRAWAL" && !value.subject
        ? WITHDRAWAL_DEFAULT_SUBJECT
        : value.subject,
  }))

/** New ticket values, as the form holds them. */
export type OpenTicketInput = z.input<typeof openTicketSchema>

/** New ticket values after validation. */
export type OpenTicketData = z.output<typeof openTicketSchema>

/** A ticket of the customer. */
export const ticketIdSchema = z.object({
  ticketId: z.uuid("Chamado inválido."),
})

/** Values of the ticket detail request. */
export type TicketIdInput = z.input<typeof ticketIdSchema>

/** A customer message in an open ticket, with optional photos. */
export const ticketReplySchema = z.object({
  ticketId: z.uuid("Chamado inválido."),
  message: z
    .string()
    .trim()
    .min(2, "Escreva a mensagem.")
    .max(TICKET_MESSAGE_MAX, `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`),
})

/** Reply values, as the form holds them. */
export type TicketReplyInput = z.input<typeof ticketReplySchema>

/** Reply values after validation. */
export type TicketReplyData = z.output<typeof ticketReplySchema>
