import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getSupportDeskTicket } from "@/features/after-sales/support-desk/action/support-desk-actions"
import { SupportDeskView } from "@/features/after-sales/support-desk/support-desk-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"
import { TICKET_NOT_FOUND_MESSAGE } from "@/features/shared/lib/support/ticket-access"

export const metadata = { title: "Chamado — Atelier Bureau" }

/**
 * Loads the ticket after checking the permission.
 *
 * @param props - Route params promise.
 * @returns The desk.
 */
async function DeskSection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePagePermission("support:manage", `/admin/atendimento/${id}`)
  const result = await getSupportDeskTicket({ ticketId: id })
  if (!result.success) {
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
        <p className="text-caps text-clay uppercase">Atendimento</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Chamado {result.ticket.number}
        </h1>
      </header>
      <SupportDeskView ticket={result.ticket} />
    </>
  )
}

/**
 * Back office route of one after-sales ticket (#68, RF17).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function AdminSupportTicketPage(
  props: PageProps<"/admin/atendimento/[id]">
) {
  return (
    <div className="flex flex-col gap-lg">
      <Link
        href="/admin/atendimento"
        className="text-body-sm text-primary underline"
      >
        Voltar à fila de atendimento
      </Link>
      <Suspense fallback={<p className="text-body">Carregando chamado…</p>}>
        <DeskSection params={props.params} />
      </Suspense>
    </div>
  )
}
