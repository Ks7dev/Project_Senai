/** Status of an after-sales ticket, as stored in the database (RF17). */
export type TicketStatusKey =
  "OPEN" | "IN_ANALYSIS" | "WAITING_CUSTOMER" | "RESOLVED" | "DENIED"

/** Kind of an after-sales ticket, as stored in the database (RF17). */
export type TicketKindKey = "WARRANTY" | "TECHNICAL_ASSISTANCE"

/** How a status is shown: label, help text for the customer and tone. */
export type TicketStatusInfo = {
  /** Label in Portuguese. */
  label: string
  /** What the status means for the customer. */
  description: string
  /** Visual tone of the badge. */
  tone: "progress" | "attention" | "done" | "problem"
}

/** Customer-facing label and meaning of each status (RF17). */
export const TICKET_STATUS: Record<TicketStatusKey, TicketStatusInfo> = {
  OPEN: {
    label: "Aberto",
    description: "Recebemos o chamado e ele aguarda a análise da equipe.",
    tone: "progress",
  },
  IN_ANALYSIS: {
    label: "Em análise",
    description: "A equipe técnica está avaliando o produto e as informações.",
    tone: "progress",
  },
  WAITING_CUSTOMER: {
    label: "Aguardando cliente",
    description:
      "A equipe precisa de uma resposta ou de mais informações suas para continuar.",
    tone: "attention",
  },
  RESOLVED: {
    label: "Resolvido",
    description: "A avaliação foi concluída e a solução está descrita abaixo.",
    tone: "done",
  },
  DENIED: {
    label: "Recusado",
    description:
      "A avaliação concluiu que o caso não tem cobertura. O motivo está descrito abaixo.",
    tone: "problem",
  },
}

/** Label of each ticket kind, in Portuguese. */
export const TICKET_KIND_LABEL: Record<TicketKindKey, string> = {
  WARRANTY: "Garantia",
  TECHNICAL_ASSISTANCE: "Assistência técnica",
}

/** Every ticket kind the customer may open, in form order. */
export const TICKET_KINDS = [
  "WARRANTY",
  "TECHNICAL_ASSISTANCE",
] as const satisfies readonly TicketKindKey[]

/** Every status, in the order of the life cycle. */
export const TICKET_STATUSES = [
  "OPEN",
  "IN_ANALYSIS",
  "WAITING_CUSTOMER",
  "RESOLVED",
  "DENIED",
] as const satisfies readonly TicketStatusKey[]

/** Statuses that end the ticket: nothing changes after them. */
export const FINAL_TICKET_STATUSES: readonly TicketStatusKey[] = [
  "RESOLVED",
  "DENIED",
]

/** Statuses of tickets still waiting for the team or the customer. */
export const OPEN_TICKET_STATUSES: readonly TicketStatusKey[] = [
  "OPEN",
  "IN_ANALYSIS",
  "WAITING_CUSTOMER",
]

/** Status changes the team may make (RF17). */
const TEAM_TRANSITIONS: Record<TicketStatusKey, readonly TicketStatusKey[]> = {
  OPEN: ["IN_ANALYSIS", "WAITING_CUSTOMER", "RESOLVED", "DENIED"],
  IN_ANALYSIS: ["WAITING_CUSTOMER", "RESOLVED", "DENIED"],
  WAITING_CUSTOMER: ["IN_ANALYSIS", "RESOLVED", "DENIED"],
  RESOLVED: [],
  DENIED: [],
}

/**
 * Whether a status ends the ticket.
 *
 * @param status - Ticket status.
 * @returns True for resolved and denied tickets.
 */
export function isFinalTicketStatus(status: TicketStatusKey): boolean {
  return FINAL_TICKET_STATUSES.includes(status)
}

/**
 * Statuses the team may move a ticket to.
 *
 * @param status - Current status.
 * @returns The allowed next statuses.
 */
export function nextTicketStatuses(
  status: TicketStatusKey
): readonly TicketStatusKey[] {
  return TEAM_TRANSITIONS[status]
}

/**
 * Whether the team may move a ticket from one status to another.
 *
 * @param from - Current status.
 * @param to - Wanted status.
 * @returns True when allowed.
 */
export function canChangeTicketStatus(
  from: TicketStatusKey,
  to: TicketStatusKey
): boolean {
  return TEAM_TRANSITIONS[from].includes(to)
}

/**
 * Whether a final status needs the written outcome of the evaluation,
 * which the customer reads in the ticket.
 *
 * @param status - Wanted status.
 * @returns True for resolved and denied.
 */
export function requiresResolution(status: TicketStatusKey): boolean {
  return isFinalTicketStatus(status)
}

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Formats an ISO date for the after-sales screens, in São Paulo time.
 *
 * @param iso - ISO date.
 * @returns "14/11/2026, 10:30".
 */
export function formatTicketDate(iso: string): string {
  return dateTime.format(new Date(iso))
}

/**
 * Status after a customer message:a ticket waiting for the customer
 * goes back to the team; any other open status stays the same.
 *
 * @param status - Current status.
 * @returns The status after the reply.
 */
export function statusAfterCustomerReply(
  status: TicketStatusKey
): TicketStatusKey {
  return status === "WAITING_CUSTOMER" ? "IN_ANALYSIS" : status
}
