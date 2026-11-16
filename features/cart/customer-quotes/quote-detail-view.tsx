"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { DownloadIcon, RefreshCwIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  decideMyQuote,
  downloadMyQuoteAttachment,
  revalidateMyQuote,
  type CustomerQuote,
} from "@/features/cart/customer-quotes/action/customer-quotes-actions"
import { QuoteStatusBadge } from "@/features/shared/components/quote-status-badge"
import { formatFileSize } from "@/features/shared/lib/quotes/quote-attachments"
import { saveDownloadedFile } from "@/features/shared/lib/quotes/save-download"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
})

/**
 * Formats a decimal string as BRL, or a dash.
 *
 * @param value - Decimal string or null.
 * @returns The formatted value.
 */
function money(value: string | null): string {
  return value === null ? "—" : brl.format(Number(value))
}

/**
 * Quote page of the customer area (#48, RF05, RF06, RF08): status,
 * validity, lines with prices, totals, notes and the attached files.
 * An expired quote says its prices no longer hold and offers the
 * revalidation (#49, RN02). An answered quote shows the proposal of
 * the sales team to approve or refuse, and a converted one links to
 * its order (#50, RF20).
 *
 * @param props - Quote and whether it was just requested.
 * @returns The quote content.
 */
export function QuoteDetailView({
  quote,
  justRequested,
}: {
  quote: CustomerQuote
  justRequested: boolean
}) {
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const [revalidationError, setRevalidationError] = useState<string>()
  const [revalidated, setRevalidated] = useState(false)
  const [decisionError, setDecisionError] = useState<string>()
  const router = useRouter()
  const expired = quote.status === "EXPIRED"

  const revalidate = () =>
    startTransition(async () => {
      setRevalidationError(undefined)
      const result = await revalidateMyQuote({ quoteId: quote.id })
      if (!result.success) return setRevalidationError(result.error)
      setRevalidated(true)
      router.refresh()
    })

  const decide = (decision: "accept" | "reject") =>
    startTransition(async () => {
      setDecisionError(undefined)
      const result = await decideMyQuote({ quoteId: quote.id, decision })
      if (!result.success) return setDecisionError(result.error)
      router.refresh()
    })

  const download = (attachmentId: string) =>
    startTransition(async () => {
      setError(undefined)
      const result = await downloadMyQuoteAttachment({ attachmentId })
      if (!result.success) return setError(result.error)
      saveDownloadedFile(result.file)
    })

  return (
    <div className="flex flex-col gap-lg">
      {justRequested && (
        <p role="status" className="rounded bg-primary-tint p-sm text-body-sm">
          Solicitação enviada. Guarde o número {quote.number} para acompanhar a
          cotação; você também recebe a confirmação por e-mail.
        </p>
      )}
      {revalidated && !expired && (
        <p role="status" className="rounded bg-primary-tint p-sm text-body-sm">
          Preços revalidados com os valores atuais do catálogo. A cotação voltou
          para a análise da equipe comercial.
        </p>
      )}
      {expired && (
        <section
          aria-labelledby="cotacao-vencida"
          className="flex flex-col items-start gap-sm rounded-lg border border-error p-md"
        >
          <h2 id="cotacao-vencida" className="text-headline-sm">
            Cotação vencida
          </h2>
          <p className="text-body-sm">
            A validade desta cotação terminou e os preços abaixo não valem mais.
            {quote.canRevalidate
              ? " Revalide os preços para atualizar os itens com os valores atuais do catálogo e devolver a cotação à equipe comercial; descontos e frete negociados antes precisam ser respondidos de novo."
              : " Peça a quem solicita cotações na sua empresa para revalidar os preços."}
          </p>
          {quote.canRevalidate && (
            <Button type="button" disabled={pending} onClick={revalidate}>
              <RefreshCwIcon aria-hidden /> Revalidar preços
            </Button>
          )}
          {revalidationError && (
            <p role="alert" className="text-body-sm text-error">
              {revalidationError}
            </p>
          )}
        </section>
      )}
      {quote.status === "ANSWERED" && (
        <section
          aria-labelledby="proposta-comercial"
          className="flex flex-col items-start gap-sm rounded-lg border border-line-subtle bg-elevated p-md"
        >
          <h2 id="proposta-comercial" className="text-headline-sm">
            Proposta da equipe comercial
          </h2>
          {quote.answerNote && (
            <p className="text-body-sm whitespace-pre-line">
              {quote.answerNote}
            </p>
          )}
          <p className="text-body-sm">
            Total da proposta: <strong>{money(quote.total)}</strong>
            {quote.validUntil &&
              `, válida até ${dateTime.format(new Date(quote.validUntil))}`}
            .{" "}
            {quote.canDecide
              ? "Ao aprovar, a equipe comercial gera o pedido com estes valores."
              : "A aprovação cabe a quem solicita cotações na sua empresa."}
          </p>
          {quote.canDecide && (
            <div className="flex flex-wrap gap-sm">
              <Button
                type="button"
                disabled={pending}
                onClick={() => decide("accept")}
              >
                Aprovar proposta
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => decide("reject")}
              >
                Recusar proposta
              </Button>
            </div>
          )}
          {decisionError && (
            <p role="alert" className="text-body-sm text-error">
              {decisionError}
            </p>
          )}
        </section>
      )}
      {quote.status === "ACCEPTED" && (
        <p role="status" className="rounded bg-primary-tint p-sm text-body-sm">
          Proposta aprovada. A equipe comercial vai gerar o pedido com os
          valores negociados e você acompanha por aqui e por e-mail.
        </p>
      )}
      {quote.status === "CONVERTED" && quote.order && (
        <p role="status" className="rounded bg-primary-tint p-sm text-body-sm">
          Esta cotação virou o pedido {quote.order.number}, com os valores
          negociados.{" "}
          <Link
            href={`/conta/pedidos/${quote.order.id}`}
            className="text-primary underline"
          >
            Ver o pedido
          </Link>
        </p>
      )}
      <dl className="grid gap-md text-body-sm lg:grid-cols-4 sm:grid-cols-2">
        <div>
          <dt className="text-ink-muted">Status</dt>
          <dd>
            <QuoteStatusBadge status={quote.status} />
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Solicitada em</dt>
          <dd>{dateTime.format(new Date(quote.createdAt))}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Solicitante</dt>
          <dd>{quote.requester}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Válida até</dt>
          <dd>
            {quote.validUntil
              ? dateTime.format(new Date(quote.validUntil))
              : "—"}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="itens" className="flex flex-col gap-sm">
        <h2 id="itens" className="text-headline-md">
          Itens
        </h2>
        <div className="overflow-x-auto rounded-lg border border-line-subtle">
          <table className="w-full min-w-[480px] text-left text-body-sm">
            <caption className="sr-only">
              Itens da cotação {quote.number}
            </caption>
            <thead className="bg-subtle text-label">
              <tr>
                <th scope="col" className="p-sm">
                  Produto
                </th>
                <th scope="col" className="p-sm">
                  Qtd.
                </th>
                <th scope="col" className="p-sm text-right">
                  Unitário
                </th>
                <th scope="col" className="p-sm text-right">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-t border-line-subtle">
                  <td className="p-sm">{line.description}</td>
                  <td className="p-sm">{line.quantity}</td>
                  <td className="p-sm text-right">{money(line.unitPrice)}</td>
                  <td className="p-sm text-right">{money(line.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-xs text-body-sm">
          <dt className="text-ink-muted">Subtotal</dt>
          <dd className="text-right">{money(quote.subtotal)}</dd>
          <dt className="text-ink-muted">Desconto</dt>
          <dd className="text-right">{money(quote.discount)}</dd>
          <dt className="text-ink-muted">Frete</dt>
          <dd className="text-right">{money(quote.shippingTotal)}</dd>
          <dt className="font-semibold">Total</dt>
          <dd className="text-right font-semibold">{money(quote.total)}</dd>
        </dl>
      </section>

      {quote.notes && (
        <section aria-labelledby="observacoes" className="flex flex-col gap-xs">
          <h2 id="observacoes" className="text-headline-sm">
            Observações
          </h2>
          <p className="text-body-sm whitespace-pre-line">{quote.notes}</p>
        </section>
      )}

      <section aria-labelledby="anexos" className="flex flex-col gap-sm">
        <h2 id="anexos" className="text-headline-sm">
          Anexos
        </h2>
        {quote.attachments.length === 0 ? (
          <p className="text-body-sm text-ink-muted">Nenhum arquivo anexado.</p>
        ) : (
          <ul className="flex flex-col gap-xs">
            {quote.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex flex-wrap items-center gap-sm text-body-sm"
              >
                <span className="min-w-0 flex-1 truncate">
                  {attachment.name}
                </span>
                <span className="text-ink-muted">
                  {formatFileSize(attachment.sizeBytes)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  aria-label={`Baixar ${attachment.name}`}
                  onClick={() => download(attachment.id)}
                >
                  <DownloadIcon aria-hidden /> Baixar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}
