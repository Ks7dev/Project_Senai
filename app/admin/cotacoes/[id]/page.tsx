import { Suspense } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getAdminQuote } from "@/features/cart/quote-management/action/quote-management-actions"
import { QuoteDeskView } from "@/features/cart/quote-management/quote-desk-view"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"
import { QUOTE_NOT_FOUND_MESSAGE } from "@/features/shared/lib/quotes/quote-access"

export const metadata = { title: "Cotação — Atelier Bureau" }

/**
 * Loads one quote after checking the permission.
 *
 * @param props - Route params promise.
 * @returns The quote or the error message.
 */
async function QuoteSection({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { permissions } = await requirePagePermission(
    "quote:read",
    `/admin/cotacoes/${id}`
  )
  const result = await getAdminQuote({ quoteId: id })
  if (!result.success) {
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
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Cotação {result.quote.number}
        </h1>
      </header>
      <QuoteDeskView
        quote={result.quote}
        canAnswer={hasPermission(permissions, "quote:answer")}
      />
    </>
  )
}

/**
 * Back office route of one quote (#50, RF20): the sales team reads the
 * request, answers with the negotiated values and converts the
 * accepted quote into an order.
 *
 * @param props - Page props with the route params.
 * @returns The page.
 */
export default function AdminQuotePage(
  props: PageProps<"/admin/cotacoes/[id]">
) {
  return (
    <div className="flex flex-col gap-lg">
      <Suspense fallback={<p className="text-body">Carregando cotação…</p>}>
        <QuoteSection params={props.params} />
      </Suspense>
      <Link
        href="/admin/cotacoes"
        className="text-body-sm text-primary underline"
      >
        Voltar à fila de cotações
      </Link>
    </div>
  )
}
