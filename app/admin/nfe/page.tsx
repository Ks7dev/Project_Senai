import { Suspense } from "react"
import { listInvoices } from "@/features/finance/invoices/action/invoice-actions"
import { InvoicesView } from "@/features/finance/invoices/invoices-view"
import {
  INVOICE_FILTERS,
  type InvoiceFilter,
} from "@/features/finance/invoices/schema/invoice-schema"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "NF-e — Atelier Bureau" }

type Search = { filtro?: string; busca?: string }

/**
 * Loads the NF-e after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The NF-e or the error message.
 */
async function InvoicesSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  await requirePagePermission("invoice:manage", "/admin/nfe")
  const params = await searchParams
  const search =
    typeof params.busca === "string" ? params.busca.trim().slice(0, 20) : ""
  const filter: InvoiceFilter = (INVOICE_FILTERS as readonly string[]).includes(
    params.filtro ?? ""
  )
    ? (params.filtro as InvoiceFilter)
    : "ALL"
  const result = await listInvoices({ filter, search })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <InvoicesView data={result.invoices} filter={filter} search={search} />
}

/**
 * Back office route of the NF-e (#63, RF13).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminInvoicesPage(props: PageProps<"/admin/nfe">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Back office</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">NF-e</h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando NF-e…</p>}>
        <InvoicesSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
