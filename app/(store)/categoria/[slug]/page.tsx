import { Suspense } from "react"
import { notFound } from "next/navigation"
import { ListingView } from "@/features/catalog/listing/listing-view"
import { parseCatalogFilters } from "@/features/shared/lib/catalog/catalog-filters"
import {
  getCategoryWithSubtree,
  queryCatalog,
} from "@/features/shared/lib/catalog/catalog-query"

type Params = { slug: string }
type Search = Record<string, string | string[] | undefined>

/**
 * Loads the category and its filtered products.
 *
 * @param props - Route params and search params promises.
 * @returns The listing.
 */
async function CategoryListing({
  params,
  searchParams,
}: {
  params: Promise<Params>
  searchParams: Promise<Search>
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams])
  const category = await getCategoryWithSubtree(slug)
  if (!category) notFound()
  const filters = parseCatalogFilters(search)
  const page = await queryCatalog(filters, category.ids)
  return (
    <ListingView
      basePath={`/categoria/${category.slug}`}
      eyebrow="Categoria"
      title={category.name}
      filters={filters}
      page={page}
    />
  )
}

/**
 * Category listing route (#24, RF02).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function CategoryPage(props: PageProps<"/categoria/[slug]">) {
  return (
    <Suspense fallback={<p className="p-xl text-body">Carregando produtos…</p>}>
      <CategoryListing
        params={props.params}
        searchParams={props.searchParams as Promise<Search>}
      />
    </Suspense>
  )
}
