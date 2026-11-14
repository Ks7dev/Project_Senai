import { Suspense } from "react"
import Link from "next/link"
import { listDemoRequests } from "@/features/after-sales/demo-desk/action/demo-desk-actions"
import { DemoDeskView } from "@/features/after-sales/demo-desk/demo-desk-view"
import { demoDeskQuerySchema } from "@/features/after-sales/demo-desk/schema/demo-desk-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Demonstrações — Atelier Bureau" }

type Search = { filtro?: string }

/**
 * Loads the demonstrations after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The list or the error message.
 */
async function DemoSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission(
    "support:manage",
    "/admin/atendimento/demonstracoes"
  )
  const { filter } = demoDeskQuerySchema.parse({
    filter: (await searchParams).filtro,
  })
  const result = await listDemoRequests({ filter })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <DemoDeskView requests={result.requests} filter={filter} />
}

/**
 * Back office route of the demonstration requests (#70, RF19).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function AdminDemosPage(
  props: PageProps<"/admin/atendimento/demonstracoes">
) {
  return (
    <div className="flex flex-col gap-lg">
      <Link
        href="/admin/atendimento"
        className="text-body-sm text-primary underline"
      >
        Voltar ao atendimento
      </Link>
      <header>
        <p className="text-caps text-clay uppercase">Comercial</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Demonstrações
        </h1>
        <p className="text-body text-ink-muted">
          Reuniões e demonstrações pedidas pelos clientes para itens de maior
          complexidade.
        </p>
      </header>
      <Suspense
        fallback={<p className="text-body">Carregando demonstrações…</p>}
      >
        <DemoSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
