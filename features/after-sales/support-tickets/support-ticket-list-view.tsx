import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import type { MyTicketRow } from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import { TicketStatusBadge } from "@/features/shared/components/support-ticket-parts"
import {
  formatTicketDate,
  TICKET_KIND_LABEL,
} from "@/features/shared/lib/support/ticket-status"

/**
 * Tickets the customer follows (RF17): number, product, kind, status
 * and last change, each linking to its detail.
 *
 * @param props - Tickets of the customer.
 * @returns The list, or an empty state.
 */
export function SupportTicketListView({ tickets }: { tickets: MyTicketRow[] }) {
  if (tickets.length === 0) {
    return (
      <div className="flex flex-col items-start gap-sm rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">
          Você ainda não abriu nenhum chamado.
        </p>
        <Link
          href="/conta/chamados/novo"
          className={buttonVariants({ size: "sm" })}
        >
          Abrir chamado
        </Link>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className="w-full min-w-[640px] text-left text-body-sm">
        <caption className="sr-only">Chamados</caption>
        <thead className="bg-subtle text-label">
          <tr>
            <th scope="col" className="p-sm">
              Chamado
            </th>
            <th scope="col" className="p-sm">
              Produto
            </th>
            <th scope="col" className="p-sm">
              Tipo
            </th>
            <th scope="col" className="p-sm">
              Situação
            </th>
            <th scope="col" className="p-sm">
              Atualizado em
            </th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="border-t border-line-subtle">
              <td className="p-sm">
                <Link
                  href={`/conta/chamados/${ticket.id}`}
                  className="text-primary underline"
                >
                  {ticket.number}
                </Link>
                <span className="block text-ink-muted">{ticket.subject}</span>
              </td>
              <td className="p-sm">
                {ticket.itemName}
                <span className="block text-ink-muted">
                  Pedido {ticket.orderNumber}
                </span>
              </td>
              <td className="p-sm">{TICKET_KIND_LABEL[ticket.kind]}</td>
              <td className="p-sm">
                <TicketStatusBadge status={ticket.status} />
              </td>
              <td className="p-sm">{formatTicketDate(ticket.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
