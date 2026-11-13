import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { AdminQuoteRow } from "@/features/cart/quote-management/action/quote-management-actions"
import {
  QUOTE_STATUS_KEYS,
  type QuoteQueueFilter,
} from "@/features/cart/quote-management/schema/quote-management-schema"
import { QuoteStatusBadge } from "@/features/shared/components/quote-status-badge"
import { QUOTE_STATUS } from "@/features/shared/lib/quotes/quote-status"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

type QuoteQueueViewProps = {
  /** Quotes to show. */
  quotes: AdminQuoteRow[]
  /** Current queue filter. */
  filter: QuoteQueueFilter
  /** Current search text. */
  search: string
}

/**
 * Sales queue of quotes (#50, RF20): number, customer, request date,
 * validity, status and total, filtered by status, each linking to the
 * page where the sales team answers and converts it.
 *
 * @param props - Quotes and filters.
 * @returns The queue.
 */
export function QuoteQueueView({
  quotes,
  filter,
  search,
}: QuoteQueueViewProps) {
  return (
    <div className="flex flex-col gap-lg">
      <form
        role="search"
        className="flex flex-wrap items-end gap-sm"
        action="/admin/cotacoes"
      >
        <div className="flex min-w-60 flex-1 flex-col gap-xs">
          <label htmlFor="busca-cotacao" className="text-label">
            Buscar por número, cliente ou empresa
          </label>
          <Input id="busca-cotacao" name="q" defaultValue={search} />
        </div>
        <div className="flex flex-col gap-xs">
          <label htmlFor="status-cotacao" className="text-label">
            Status
          </label>
          <select
            id="status-cotacao"
            name="status"
            defaultValue={filter}
            className="h-11 rounded border border-line bg-canvas px-md text-body"
          >
            <option value="OPEN">Em aberto</option>
            {QUOTE_STATUS_KEYS.map((key) => (
              <option key={key} value={key}>
                {QUOTE_STATUS[key].label}
              </option>
            ))}
            <option value="ALL">Todas</option>
          </select>
        </div>
        <button type="submit" className={buttonVariants({ variant: "ghost" })}>
          Filtrar
        </button>
      </form>

      {quotes.length === 0 ? (
        <p className="text-body text-ink-muted">
          {filter === "OPEN" && !search
            ? "Nenhuma cotação em aberto na fila."
            : "Nenhuma cotação encontrada."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full min-w-[720px] text-left text-body-sm">
            <caption className="sr-only">Fila de cotações</caption>
            <thead className="bg-subtle text-label">
              <tr>
                <th scope="col" className="p-sm">
                  Cotação
                </th>
                <th scope="col" className="p-sm">
                  Cliente
                </th>
                <th scope="col" className="p-sm">
                  Solicitada em
                </th>
                <th scope="col" className="p-sm">
                  Validade
                </th>
                <th scope="col" className="p-sm">
                  Itens
                </th>
                <th scope="col" className="p-sm">
                  Status
                </th>
                <th scope="col" className="p-sm text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {quotes.map((quote) => (
                <tr key={quote.id} className="border-t border-line-subtle">
                  <td className="p-sm">
                    <Link
                      href={`/admin/cotacoes/${quote.id}`}
                      className="text-primary underline"
                    >
                      {quote.number}
                    </Link>
                  </td>
                  <td className="p-sm">
                    {quote.customer}
                    {quote.company && (
                      <span className="block text-ink-muted">
                        {quote.company}
                      </span>
                    )}
                  </td>
                  <td className="p-sm">
                    {date.format(new Date(quote.createdAt))}
                  </td>
                  <td className="p-sm">
                    {quote.validUntil
                      ? date.format(new Date(quote.validUntil))
                      : "—"}
                  </td>
                  <td className="p-sm">{quote.lines}</td>
                  <td className="p-sm">
                    <QuoteStatusBadge status={quote.status} />
                  </td>
                  <td className="p-sm text-right">
                    {brl.format(Number(quote.total))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
