import { Suspense } from "react"
import { notFound } from "next/navigation"
import { loadProductPageForCustomer } from "@/features/catalog/product-page/load-product"
import { ProductPageView } from "@/features/catalog/product-page/product-page-view"

/**
 * Loads the published product by slug.
 *
 * @param props - Route params promise.
 * @returns The product page.
 */
async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await loadProductPageForCustomer(slug)
  if (!product) notFound()
  return <ProductPageView product={product} />
}

/**
 * Product page route (#26, RF03).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function ProductPage(props: PageProps<"/produto/[slug]">) {
  return (
    <Suspense fallback={<p className="p-xl text-body">Carregando produto…</p>}>
      <ProductContent params={props.params} />
    </Suspense>
  )
}
