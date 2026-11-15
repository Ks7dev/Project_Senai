import { z } from "zod"
import {
  TICKET_DESCRIPTION_MIN,
  TICKET_MESSAGE_MAX,
  TICKET_SUBJECT_MAX,
  TICKET_SUBJECT_MIN,
} from "@/features/shared/lib/support/ticket-format"
import { TICKET_KINDS } from "@/features/shared/lib/support/ticket-status"

/** Query string of the new ticket page: preselected order and item. */
export const ticketFormSourceSchema = z.object({
  /** Order id, when the customer came from the order page. */
  pedido: z.uuid().optional().catch(undefined),
  /** Order item id. */
  item: z.uuid().optional().catch(undefined),
})

/** Values of the new ticket page query string. */
export type TicketFormSource = z.input<typeof ticketFormSourceSchema>

/**
 * New warranty or technical assistance ticket (RF17): the order and the
 * item it refers to, the kind, a subject and the description of the
 * problem. Photos travel as files next to it.
 */
export const openTicketSchema = z.object({
  orderId: z.uuid("Escolha o pedido."),
  orderItemId: z.uuid("Escolha o produto do pedido."),
  kind: z.enum(TICKET_KINDS, "Escolha o tipo de chamado."),
  subject: z
    .string()
    .trim()
    .min(
      TICKET_SUBJECT_MIN,
      `Resuma o problema em pelo menos ${TICKET_SUBJECT_MIN} caracteres.`
    )
    .max(TICKET_SUBJECT_MAX, `Use no máximo ${TICKET_SUBJECT_MAX} caracteres.`),
  description: z
    .string()
    .trim()
    .min(
      TICKET_DESCRIPTION_MIN,
      `Descreva o problema em pelo menos ${TICKET_DESCRIPTION_MIN} caracteres.`
    )
    .max(TICKET_MESSAGE_MAX, `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`),
})

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
