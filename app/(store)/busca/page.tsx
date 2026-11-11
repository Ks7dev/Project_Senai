import { Suspense } from "react"
import Link from "next/link"
import { PageContainer } from "@/components/layout/page-container"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ListingView } from "@/features/catalog/listing/listing-view"
import { parseCatalogFilters } from "@/features/shared/lib/catalog/catalog-filters"
import {
  queryCatalog,
  searchSuggestions,
} from "@/features/shared/lib/catalog/catalog-query"

export const metadata = { title: "Busca — Atelier Bureau" }

type Search = Record<string, string | string[] | undefined>

/**
 * Search form shown when there is no search text.
 *
 * @returns The form.
 */
function EmptySearch() {
  return (
    <PageContainer className="flex flex-col gap-md py-xl">
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">
        Buscar produtos
      </h1>
      <form action="/busca" role="search" className="flex max-w-xl gap-sm">
        <label htmlFor="busca-pagina" className="sr-only">
          Buscar produtos
        </label>
        <Input
          id="busca-pagina"
          name="q"
          type="search"
          placeholder="Ex.: caneta tinteiro, nogueira, luminária"
        />
        <Button type="submit">Buscar</Button>
      </form>
    </PageContainer>
  )
}

/**
 * Loads the search results with the same filters as the listing.
 *
 * @param props - Search params promise.
 * @returns The results.
 */
async function SearchResults({
  searchParams,
}: {
  searchParams: Promise<Search>
}) {
  const filters = parseCatalogFilters(await searchParams)
  if (!filters.q) return <EmptySearch />
  const [page, suggestions] = await Promise.all([
    queryCatalog(filters),
    searchSuggestions(filters.q),
  ])
  const hasSuggestions =
    suggestions.categories.length > 0 || suggestions.products.length > 0
  return (
    <ListingView
      basePath="/busca"
      eyebrow="Resultados da busca"
      title={`“${filters.q}”`}
      filters={filters}
      page={page}
    >
      {hasSuggestions && (
        <nav aria-label="Sugestões" className="flex flex-wrap gap-sm">
          {suggestions.categories.map((category) => (
            <Link
              key={category.slug}
              href={`/categoria/${category.slug}`}
              className="rounded-full bg-clay-tint px-md py-1 text-label-sm text-ink"
            >
              Categoria: {category.name}
            </Link>
          ))}
          {suggestions.products.map((product) => (
            <Link
              key={product.slug}
              href={`/produto/${product.slug}`}
              className="rounded-full bg-subtle px-md py-1 text-label-sm text-ink"
            >
              {product.name}
            </Link>
          ))}
        </nav>
      )}
    </ListingView>
  )
}

/**
 * Product search route (#25, RF02).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function SearchPage(props: PageProps<"/busca">) {
  return (
    <Suspense fallback={<p className="p-xl text-body">Buscando…</p>}>
      <SearchResults searchParams={props.searchParams as Promise<Search>} />
    </Suspense>
  )
}
