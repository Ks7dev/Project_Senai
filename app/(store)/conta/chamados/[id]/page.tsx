import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getMySupportTicket } from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import { SupportTicketDetailView } from "@/features/after-sales/support-tickets/support-ticket-detail-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { TICKET_NOT_FOUND_MESSAGE } from "@/features/shared/lib/support/ticket-access"

export const metadata = { title: "Chamado — Atelier Bureau" }

/**
 * Loads a ticket of the logged-in customer.
 *
 * @param props - Route params and search params promises.
 * @returns The ticket.
 */
async function TicketContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ novo?: string }>
}) {
  const { id } = await params
  const { novo } = await searchParams
  const result = await getMySupportTicket({ ticketId: id })
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      redirect(
        `/entrar?redirect=${encodeURIComponent(`/conta/chamados/${id}`)}`
      )
    }
    if (
      result.error === TICKET_NOT_FOUND_MESSAGE ||
      result.error === "Chamado inválido."
    ) {
      notFound()
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Chamado {result.ticket.number}
        </h1>
      </header>
      <SupportTicketDetailView
        ticket={result.ticket}
        justOpened={novo === "1"}
      />
    </>
  )
}

/**
 * Ticket followed by the customer (#68, RF17).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function SupportTicketPage(
  props: PageProps<"/conta/chamados/[id]">
) {
  return (
    <>
      <Suspense fallback={<p className="text-body">Carregando chamado…</p>}>
        <TicketContent
          params={props.params}
          searchParams={props.searchParams as Promise<{ novo?: string }>}
        />
      </Suspense>
      <Link
        href="/conta/chamados"
        className="text-body-sm text-primary underline"
      >
        Voltar aos chamados
      </Link>
    </>
  )
}
