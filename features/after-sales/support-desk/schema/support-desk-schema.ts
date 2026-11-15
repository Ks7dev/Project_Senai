import { z } from "zod"
import {
  TICKET_MESSAGE_MAX,
  TICKET_RESOLUTION_MIN,
} from "@/features/shared/lib/support/ticket-format"
import {
  requiresResolution,
  TICKET_STATUSES,
} from "@/features/shared/lib/support/ticket-status"

/** Filters of the after-sales queue. */
export const SUPPORT_QUEUE_FILTERS = [
  "OPEN",
  "WAITING_CUSTOMER",
  "FINISHED",
  "ALL",
] as const

/** A filter of the after-sales queue. */
export type SupportQueueFilter = (typeof SUPPORT_QUEUE_FILTERS)[number]

/** Label of each queue filter, in Portuguese. */
export const SUPPORT_QUEUE_FILTER_LABEL: Record<SupportQueueFilter, string> = {
  OPEN: "Em aberto",
  WAITING_CUSTOMER: "Aguardando cliente",
  FINISHED: "Encerrados",
  ALL: "Todos",
}

/** Queue query: filter and search by number, customer or order. */
export const supportQueueSchema = z.object({
  filter: z.enum(SUPPORT_QUEUE_FILTERS).catch("OPEN"),
  search: z.string().trim().max(60).catch(""),
})

/** Values of the queue query. */
export type SupportQueueInput = z.input<typeof supportQueueSchema>

/** A ticket of the back office. */
export const supportDeskTicketSchema = z.object({
  ticketId: z.uuid("Chamado inválido."),
})

/** Values of the back office ticket request. */
export type SupportDeskTicketInput = z.input<typeof supportDeskTicketSchema>

/**
 * Answer of the team to a ticket (RF17): a new status, a message to the
 * customer, or both. Resolving or denying needs the written outcome of
 * the evaluation, which the customer reads in the ticket.
 */
export const supportTicketUpdateSchema = z
  .object({
    ticketId: z.uuid("Chamado inválido."),
    status: z.enum(TICKET_STATUSES).or(z.literal("")),
    message: z
      .string()
      .trim()
      .max(
        TICKET_MESSAGE_MAX,
        `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`
      ),
    resolution: z
      .string()
      .trim()
      .max(
        TICKET_MESSAGE_MAX,
        `Use no máximo ${TICKET_MESSAGE_MAX} caracteres.`
      ),
  })
  .superRefine((value, context) => {
    if (!value.status && !value.message) {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message: "Escreva uma mensagem ou altere a situação do chamado.",
      })
    }
    if (
      value.status &&
      requiresResolution(value.status) &&
      value.resolution.length < TICKET_RESOLUTION_MIN
    ) {
      context.addIssue({
        code: "custom",
        path: ["resolution"],
        message: `Descreva o resultado da avaliação (mínimo de ${TICKET_RESOLUTION_MIN} caracteres).`,
      })
    }
  })

/** Answer values, as the form holds them. */
export type SupportTicketUpdateInput = z.input<typeof supportTicketUpdateSchema>

/** Answer values after validation. */
export type SupportTicketUpdateData = z.output<typeof supportTicketUpdateSchema>
