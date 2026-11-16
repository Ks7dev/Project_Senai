import { Suspense } from "react"
import { listAdminProducts } from "@/features/catalog/products-admin/action/product-actions"
import { ProductsListView } from "@/features/catalog/products-admin/products-list-view"
import { hasPermission } from "@/features/shared/lib/auth/permissions"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

type Search = { q?: string; status?: string }

/**
 * Loads the product list after checking the permission.
 *
 * @param props - Search params promise.
 * @returns The list.
 */
async function ProductsSection({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const { permissions } = await requirePagePermission(
    "product:read",
    "/admin/produtos"
  )
  const { q = "", status = "" } = await searchParams
  const result = await listAdminProducts({ search: q, status })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return (
    <ProductsListView
      products={result.products}
      search={q}
      status={status}
      canCreate={hasPermission(permissions, "product:create")}
    />
  )
}

/**
 * Back office products route (#21).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function AdminProductsPage(props: PageProps<"/admin/produtos">) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Catálogo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Produtos
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando produtos…</p>}>
        <ProductsSection searchParams={props.searchParams as Promise<Search>} />
      </Suspense>
    </div>
  )
}
