import { Suspense } from "react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { getMyQuote } from "@/features/cart/customer-quotes/action/customer-quotes-actions"
import { QuoteDetailView } from "@/features/cart/customer-quotes/quote-detail-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { QUOTE_NOT_FOUND_MESSAGE } from "@/features/shared/lib/quotes/quote-access"

export const metadata = { title: "Cotação — Atelier Bureau" }

/**
 * Loads one quote of the customer.
 *
 * @param props - Route params and search params promises.
 * @returns The quote content.
 */
async function QuoteContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ nova?: string }>
}) {
  const [{ id }, { nova }] = await Promise.all([params, searchParams])
  const result = await getMyQuote({ quoteId: id })
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      redirect(
        `/entrar?redirect=${encodeURIComponent(`/conta/cotacoes/${id}`)}`
      )
    }
    if (result.error === QUOTE_NOT_FOUND_MESSAGE) notFound()
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
          Cotação {result.quote.number}
        </h1>
      </header>
      <QuoteDetailView quote={result.quote} justRequested={nova === "1"} />
      <Link
        href="/conta/cotacoes"
        className="text-body-sm text-primary underline"
      >
        Voltar às cotações
      </Link>
    </>
  )
}

/**
 * Quote page of the customer area (#48, RF05, RF06, RF08).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function AccountQuotePage(
  props: PageProps<"/conta/cotacoes/[id]">
) {
  return (
    <Suspense fallback={<p className="text-body">Carregando cotação…</p>}>
      <QuoteContent
        params={props.params}
        searchParams={props.searchParams as Promise<{ nova?: string }>}
      />
    </Suspense>
  )
}
