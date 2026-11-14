import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { SupportQueueRow } from "@/features/after-sales/support-desk/action/support-desk-actions"
import {
  SUPPORT_QUEUE_FILTER_LABEL,
  SUPPORT_QUEUE_FILTERS,
  type SupportQueueFilter,
} from "@/features/after-sales/support-desk/schema/support-desk-schema"
import { TicketStatusBadge } from "@/features/shared/components/support-ticket-parts"
import {
  formatTicketDate,
  TICKET_KIND_LABEL,
} from "@/features/shared/lib/support/ticket-status"

/**
 * After-sales queue of the back office (RF17): filters by status, a
 * search and the tickets, oldest first.
 *
 * @param props - Tickets, the active filter and the search.
 * @returns The queue.
 */
export function SupportQueueView({
  tickets,
  filter,
  search,
}: {
  tickets: SupportQueueRow[]
  filter: SupportQueueFilter
  search: string
}) {
  return (
    <div className="flex flex-col gap-md">
      <nav aria-label="Filtrar chamados" className="flex flex-wrap gap-sm">
        {SUPPORT_QUEUE_FILTERS.map((option) => (
          <Link
            key={option}
            href={`/admin/atendimento?status=${option}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            aria-current={option === filter ? "page" : undefined}
            className={buttonVariants({
              variant: option === filter ? "default" : "ghost",
              size: "sm",
            })}
          >
            {SUPPORT_QUEUE_FILTER_LABEL[option]}
          </Link>
        ))}
      </nav>
      <form
        role="search"
        action="/admin/atendimento"
        className="flex flex-wrap items-end gap-sm"
      >
        <input type="hidden" name="status" value={filter} />
        <label htmlFor="support-search" className="sr-only">
          Buscar por chamado, pedido, cliente ou e-mail
        </label>
        <Input
          id="support-search"
          name="q"
          defaultValue={search}
          placeholder="Chamado, pedido, cliente ou e-mail"
          className="max-w-sm"
        />
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          Buscar
        </button>
      </form>

      {tickets.length === 0 ? (
        <p className="rounded-lg bg-subtle p-lg text-body text-ink-muted">
          Nenhum chamado neste filtro.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full min-w-[760px] text-left text-body-sm">
            <caption className="sr-only">Chamados de pós-venda</caption>
            <thead className="bg-subtle text-label">
              <tr>
                <th scope="col" className="p-sm">
                  Chamado
                </th>
                <th scope="col" className="p-sm">
                  Cliente
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
                  Aberto em
                </th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t border-line-subtle">
                  <td className="p-sm">
                    <Link
                      href={`/admin/atendimento/${ticket.id}`}
                      className="text-primary underline"
                    >
                      {ticket.number}
                    </Link>
                    <span className="block text-ink-muted">
                      {ticket.subject}
                    </span>
                  </td>
                  <td className="p-sm">
                    {ticket.customer}
                    {ticket.company && (
                      <span className="block text-ink-muted">
                        {ticket.company}
                      </span>
                    )}
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
                  <td className="p-sm">{formatTicketDate(ticket.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
