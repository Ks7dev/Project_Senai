import { Suspense } from "react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { loadProductPage } from "@/features/catalog/product-page/load-product"
import { ProductPageView } from "@/features/catalog/product-page/product-page-view"
import { siteUrl } from "@/features/shared/lib/email/site-url"
import {
  buildProductJsonLd,
  excerpt,
  serializeJsonLd,
  STORE_NAME,
} from "@/features/shared/lib/seo/product-json-ld"

/**
 * Title, description, canonical URL and Open Graph data of the product
 * page (RNF14, #31).
 *
 * @param props - Page props.
 * @returns The page metadata.
 */
export async function generateMetadata(
  props: PageProps<"/produto/[slug]">
): Promise<Metadata> {
  const { slug } = await props.params
  const product = await loadProductPage(slug)
  if (!product) return { title: `Produto não encontrado — ${STORE_NAME}` }
  const description = excerpt(product.description)
  const base = siteUrl()
  const path = `${base}/produto/${product.slug}`
  return {
    title: `${product.name} — ${STORE_NAME}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title: product.name,
      description,
      url: path,
      siteName: STORE_NAME,
      locale: "pt_BR",
      images: product.images.slice(0, 1).map((image) => ({
        url: `${base}/media/${image.key}-1024.webp`,
        alt: image.alt,
      })),
    },
  }
}

/**
 * Loads the published product by slug.
 *
 * @param props - Route params promise.
 * @returns The product page with its structured data.
 */
async function ProductContent({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const product = await loadProductPage(slug)
  if (!product) notFound()
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd(buildProductJsonLd(product, siteUrl())),
        }}
      />
      <ProductPageView product={product} />
    </>
  )
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
