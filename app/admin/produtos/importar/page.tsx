import { Suspense } from "react"
import { ImportView } from "@/features/catalog/products-admin/import-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

/**
 * Checks the permission before showing the import form.
 *
 * @returns The import view.
 */
async function ImportSection() {
  await requirePagePermission("product:create", "/admin/produtos/importar")
  return <ImportView />
}

/**
 * Product CSV import route (#29).
 *
 * @returns The page.
 */
export default function ImportProductsPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Catálogo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Importar produtos
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <ImportSection />
      </Suspense>
    </div>
  )
}
