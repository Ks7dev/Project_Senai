import { Suspense } from "react"
import { ProductFormView } from "@/features/catalog/products-admin/product-form-view"
import { getCategoryOptions } from "@/features/shared/lib/catalog/category-cache"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

/**
 * Loads the category options after checking the permission.
 *
 * @returns The empty product form.
 */
async function NewProductSection() {
  await requirePagePermission("product:create", "/admin/produtos/novo")
  return <ProductFormView categories={await getCategoryOptions()} />
}

/**
 * New product route (#21).
 *
 * @returns The page.
 */
export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Catálogo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Novo produto
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <NewProductSection />
      </Suspense>
    </div>
  )
}
