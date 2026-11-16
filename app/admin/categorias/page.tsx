import { Suspense } from "react"
import { listAdminCategories } from "@/features/catalog/categories/action/category-actions"
import { CategoriesView } from "@/features/catalog/categories/categories-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

/**
 * Loads the categories after checking the permission.
 *
 * @returns The manager or the error message.
 */
async function CategoriesSection() {
  await requirePagePermission("category:manage", "/admin/categorias")
  const result = await listAdminCategories()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <CategoriesView categories={result.categories} />
}

/**
 * Back office categories route (#23).
 *
 * @returns The page.
 */
export default function AdminCategoriesPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Catálogo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Categorias
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando categorias…</p>}>
        <CategoriesSection />
      </Suspense>
    </div>
  )
}
