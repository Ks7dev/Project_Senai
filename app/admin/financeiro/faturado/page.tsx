import { Suspense } from "react"
import Link from "next/link"
import { listReceivables } from "@/features/finance/invoiced-billing/action/invoiced-billing-actions"
import { InvoicedBillingView } from "@/features/finance/invoiced-billing/invoiced-billing-view"
import {
  RECEIVABLE_FILTERS,
  type ReceivableFilter,
} from "@/features/finance/invoiced-billing/schema/invoiced-billing-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Faturado — Atelier Bureau" }

type Search = { filtro?: string; busca?: string }

/**
 * Loads the receivables after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The receivables or the error message.
 */
async function ReceivablesSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("payment:refund", "/admin/financeiro/faturado")
  const params = await searchParams
  const search =
    typeof params.busca === "string" ? params.busca.trim().slice(0, 60) : ""
  const filter: ReceivableFilter = (
    RECEIVABLE_FILTERS as readonly string[]
  ).includes(params.filtro ?? "")
    ? (params.filtro as ReceivableFilter)
    : "OPEN"
  const result = await listReceivables({ filter, search })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <InvoicedBillingView
      data={result.receivables}
      filter={filter}
      search={search}
    />
  )
}

/**
 * Back office route of the invoiced receivables (#60, RF12, RF33).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminInvoicedPage(
  props: PageProps<"/admin/financeiro/faturado">
) {
  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <Link
          href="/admin/financeiro"
          className="text-body-sm text-primary underline"
        >
          Financeiro
        </Link>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Faturado 28/56 dias
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando parcelas…</p>}>
        <ReceivablesSection
          searchParams={props.searchParams as Promise<Search>}
        />
      </Suspense>
    </div>
  )
}
