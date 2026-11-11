import { Suspense } from "react"
import { getAdminProduct } from "@/features/catalog/products-admin/action/product-actions"
import { ProductFormView } from "@/features/catalog/products-admin/product-form-view"
import { getCategoryOptions } from "@/features/shared/lib/catalog/category-cache"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

/**
 * Loads the product and the category options.
 *
 * @param props - Route params promise.
 * @returns The filled product form.
 */
async function EditProductSection({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  await requirePagePermission("product:update", `/admin/produtos/${id}`)
  const [result, categories] = await Promise.all([
    getAdminProduct(id),
    getCategoryOptions(),
  ])
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <ProductFormView categories={categories} product={result.product} />
}

/**
 * Edit product route (#21, #22).
 *
 * @param props - Page props with the product id.
 * @returns The page.
 */
export default function EditProductPage(
  props: PageProps<"/admin/produtos/[id]">
) {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Catálogo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Editar produto
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando produto…</p>}>
        <EditProductSection params={props.params} />
      </Suspense>
    </div>
  )
}
