import { Suspense } from "react"
import Link from "next/link"
import { listSupportQueue } from "@/features/after-sales/support-desk/action/support-desk-actions"
import { supportQueueSchema } from "@/features/after-sales/support-desk/schema/support-desk-schema"
import { SupportQueueView } from "@/features/after-sales/support-desk/support-queue-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Atendimento — Atelier Bureau" }

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
  await requirePagePermission("support:manage", "/admin/atendimento")
  const params = await searchParams
  const { filter, search } = supportQueueSchema.parse({
    filter: params.status,
    search: typeof params.q === "string" ? params.q.slice(0, 60) : "",
  })
  const result = await listSupportQueue({ filter, search })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <SupportQueueView
      tickets={result.tickets}
      filter={filter}
      search={search}
    />
  )
}

/**
 * Back office route of the after-sales queue (#68, RF17).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminSupportPage(
  props: PageProps<"/admin/atendimento">
) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Pós-venda</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Atendimento
        </h1>
        <p className="text-body text-ink-muted">
          Chamados de garantia e assistência técnica abertos pelos clientes.
        </p>
        <nav
          aria-label="Seções do atendimento"
          className="flex flex-wrap gap-md pt-sm"
        >
          <Link
            href="/admin/atendimento/demonstracoes"
            className="text-body-sm text-primary underline"
          >
            Demonstrações agendadas
          </Link>
          <Link
            href="/admin/atendimento/vendedores"
            className="text-body-sm text-primary underline"
          >
            Vendedores dedicados e WhatsApp
          </Link>
        </nav>
      </header>
      <Suspense fallback={<p className="text-body">Carregando chamados…</p>}>
        <QueueSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
