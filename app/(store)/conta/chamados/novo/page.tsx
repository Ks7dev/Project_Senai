import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTicketForm } from "@/features/after-sales/support-tickets/action/support-ticket-actions"
import { SupportTicketFormView } from "@/features/after-sales/support-tickets/support-ticket-form-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"

export const metadata = { title: "Abrir chamado — Atelier Bureau" }

/** Query string of the page. */
type SearchParams = { pedido?: string; item?: string }

/**
 * Loads the delivered orders; visitors go to the login and come back.
 *
 * @param props - Search params promise.
 * @returns The form.
 */
async function TicketForm({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { pedido, item } = await searchParams
  const result = await getTicketForm({
    pedido: typeof pedido === "string" ? pedido : undefined,
    item: typeof item === "string" ? item : undefined,
  })
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      redirect("/entrar?redirect=%2Fconta%2Fchamados%2Fnovo")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <SupportTicketFormView form={result.form} />
}

/**
 * New warranty or technical assistance ticket (#68, RF17).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function NewSupportTicketPage(
  props: PageProps<"/conta/chamados/novo">
) {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Abrir chamado
        </h1>
        <p className="text-body text-ink-muted">
          Garantia ou assistência técnica de um produto que você recebeu. A
          equipe avalia o caso e responde por aqui e por e-mail.
        </p>
      </header>
      <Suspense fallback={<p className="text-body">Carregando pedidos…</p>}>
        <TicketForm
          searchParams={props.searchParams as Promise<SearchParams>}
        />
      </Suspense>
    </>
  )
}
