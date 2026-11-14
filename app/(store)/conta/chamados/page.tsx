import { Suspense } from "react"
import Link from "next/link"
import { redirect } from "next/navigation"
import { buttonVariants } from "@/components/ui/button"
import { listMySupportTickets } from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import { SupportTicketListView } from "@/features/after-sales/support-tickets/support-ticket-list-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"

export const metadata = { title: "Chamados — Atelier Bureau" }

/**
 * Loads the tickets of the logged-in customer.
 *
 * @returns The list or the error message.
 */
async function TicketList() {
  const result = await listMySupportTickets()
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      redirect("/entrar?redirect=%2Fconta%2Fchamados")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <SupportTicketListView tickets={result.tickets} />
}

/**
 * Warranty and technical assistance tickets of the customer (#68, RF17).
 *
 * @returns The page.
 */
export default function SupportTicketsPage() {
  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-md">
        <div>
          <p className="text-caps text-clay uppercase">Minha conta</p>
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">
            Chamados
          </h1>
          <p className="text-body text-ink-muted">
            Garantia e assistência técnica dos produtos que você recebeu.
          </p>
        </div>
        <Link href="/conta/chamados/novo" className={buttonVariants()}>
          Abrir chamado
        </Link>
      </header>
      <Suspense fallback={<p className="text-body">Carregando chamados…</p>}>
        <TicketList />
      </Suspense>
    </>
  )
}
