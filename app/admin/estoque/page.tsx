import { Suspense } from "react"
import { listStock } from "@/features/orders/stock/action/stock-actions"
import { StockView } from "@/features/orders/stock/stock-view"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

type Search = { q?: string; "sem-estoque"?: string }

/**
 * Loads the stock after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The stock screen or the error message.
 */
async function StockSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { permissions } = await requirePagePermission(
    "stock:read",
    "/admin/estoque"
  )
  const params = await searchParams
  const search = typeof params.q === "string" ? params.q : ""
  const onlyUnavailable = params["sem-estoque"] === "1"
  const result = await listStock({ search, onlyUnavailable })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <StockView
      rows={result.rows}
      movements={result.movements}
      search={search}
      onlyUnavailable={onlyUnavailable}
      canUpdate={hasPermission(permissions, "stock:update")}
    />
  )
}

/**
 * Back office stock route (#64, RF43).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminStockPage(props: PageProps<"/admin/estoque">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Estoque e logística</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">Estoque</h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando estoque…</p>}>
        <StockSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
