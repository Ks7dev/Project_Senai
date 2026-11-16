import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PageContainer } from "@/components/layout/page-container"
import { getQuoteRequestForm } from "@/features/cart/quote-request/action/quote-request-actions"
import { QuoteRequestView } from "@/features/cart/quote-request/quote-request-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"

export const metadata = {
  title: "Solicitar cotação — Atelier Bureau",
  description:
    "Solicite uma cotação personalizada para sua empresa: volumes, gravação, prazos e condições de pagamento.",
}

/** Query string of the page. */
type SearchParams = { produto?: string; origem?: string }

/**
 * Loads the lines of the request; visitors go to the login and come
 * back to the same request.
 *
 * @param props - Search params promise.
 * @returns The form.
 */
async function QuoteRequest({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { produto, origem } = await searchParams
  const result = await getQuoteRequestForm({
    produto: typeof produto === "string" ? produto : undefined,
    origem: origem === "carrinho" ? "carrinho" : undefined,
  })
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      const query = new URLSearchParams()
      if (typeof produto === "string") query.set("produto", produto)
      if (origem === "carrinho") query.set("origem", origem)
      const back = `/cotacao/nova${query.size > 0 ? `?${query}` : ""}`
      redirect(`/entrar?redirect=${encodeURIComponent(back)}`)
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <QuoteRequestView form={result.form} />
}

/**
 * Quote request route (#48, RF05, RF08): the product page and the cart
 * link here.
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function QuoteRequestPage(props: PageProps<"/cotacao/nova">) {
  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Cotação</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Solicitar cotação
        </h1>
        <p className="text-body text-ink-muted">
          Peça um orçamento formal para os itens ou para o carrinho inteiro e
          anexe a planta do escritório ou as especificações do projeto.
        </p>
      </header>
      <Suspense fallback={<p className="text-body">Carregando cotação…</p>}>
        <QuoteRequest
          searchParams={props.searchParams as Promise<SearchParams>}
        />
      </Suspense>
    </PageContainer>
  )
}
