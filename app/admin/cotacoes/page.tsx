import { Suspense } from "react"
import { listAdminQuotes } from "@/features/cart/quote-management/action/quote-management-actions"
import { QuoteQueueView } from "@/features/cart/quote-management/quote-queue-view"
import {
  QUOTE_QUEUE_FILTERS,
  type QuoteQueueFilter,
} from "@/features/cart/quote-management/schema/quote-management-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Cotações — Atelier Bureau" }

type Search = { q?: string; status?: string }

/**
 * Loads the queue after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The queue or the error message.
 */
async function QueueSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("quote:read", "/admin/cotacoes")
  const params = await searchParams
  const search = typeof params.q === "string" ? params.q.slice(0, 60) : ""
  const filter: QuoteQueueFilter = (
    QUOTE_QUEUE_FILTERS as readonly string[]
  ).includes(params.status ?? "")
    ? (params.status as QuoteQueueFilter)
    : "OPEN"
  const result = await listAdminQuotes({ filter, search })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <QuoteQueueView quotes={result.quotes} filter={filter} search={search} />
  )
}

/**
 * Back office route of the sales queue of quotes (#50, RF20).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminQuotesPage(props: PageProps<"/admin/cotacoes">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Cotações
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando cotações…</p>}>
        <QueueSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
