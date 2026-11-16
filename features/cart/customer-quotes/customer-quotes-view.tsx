import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"
import type { CustomerQuoteRow } from "@/features/cart/customer-quotes/action/customer-quotes-actions"
import { QuoteStatusBadge } from "@/features/shared/components/quote-status-badge"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const date = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Quotes of the customer area (#48, RF05, RF06): number, request date,
 * validity, status and total, each linking to its page.
 *
 * @param props - Quotes and whether they are the whole company's.
 * @returns The table, or an empty state.
 */
export function CustomerQuotesView({
  quotes,
  companyWide,
}: {
  quotes: CustomerQuoteRow[]
  companyWide: boolean
}) {
  if (quotes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-sm rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">
          Nenhuma cotação por aqui ainda. Na página do produto ou no carrinho,
          use “Solicitar cotação”.
        </p>
        <Link
          href="/busca"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          Explorar a loja
        </Link>
      </div>
    )
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-line-subtle">
      <table className="w-full min-w-[560px] text-left text-body-sm">
        <caption className="sr-only">Cotações</caption>
        <thead className="bg-subtle text-label">
          <tr>
            <th scope="col" className="p-sm">
              Cotação
            </th>
            <th scope="col" className="p-sm">
              Data
            </th>
            {companyWide && (
              <th scope="col" className="p-sm">
                Solicitante
              </th>
            )}
            <th scope="col" className="p-sm">
              Validade
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
                  href={`/conta/cotacoes/${quote.id}`}
                  className="text-primary underline"
                >
                  {quote.number}
                </Link>
              </td>
              <td className="p-sm">{date.format(new Date(quote.createdAt))}</td>
              {companyWide && <td className="p-sm">{quote.requester}</td>}
              <td className="p-sm">
                {quote.validUntil
                  ? date.format(new Date(quote.validUntil))
                  : "—"}
              </td>
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
  )
}
