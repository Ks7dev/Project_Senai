import Link from "next/link"
import { ProductCard } from "@/components/commerce/product-card"
import { PageContainer } from "@/components/layout/page-container"
import { buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  filtersToQuery,
  LEAD_TIME_OPTIONS,
  SORT_OPTIONS,
  toggleValue,
  type CatalogFilters,
  type LeadTimeKey,
} from "@/features/shared/lib/catalog/catalog-filters"
import type { CatalogPage } from "@/features/shared/lib/catalog/catalog-query"
import { cn } from "@/lib/utils"

type ListingViewProps = {
  /** Base path: "/categoria/<slug>" or "/busca". */
  basePath: string
  /** Small label above the title. */
  eyebrow: string
  /** Page title. */
  title: string
  /** Current filters. */
  filters: CatalogFilters
  /** Products and facets. */
  page: CatalogPage
  /** Extra content above the results (search suggestions). */
  children?: React.ReactNode
}

/**
 * Product listing with combinable filters reflected in the URL, result
 * counts per filter, sorting, pagination and empty state (RF02). The
 * filters are links and a GET form, so they work without JavaScript.
 *
 * @param props - Listing data and filters.
 * @returns The listing.
 */
export function ListingView({
  basePath,
  eyebrow,
  title,
  filters,
  page,
  children,
}: ListingViewProps) {
  const href = (changes: Partial<Record<keyof CatalogFilters, unknown>>) =>
    `${basePath}${filtersToQuery(filters, { pagina: 1, ...changes })}`
  const hasFilters =
    filters.marca.length > 0 ||
    filters.material.length > 0 ||
    filters.min !== undefined ||
    filters.max !== undefined ||
    filters.prazo !== undefined

  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header className="flex flex-col gap-sm">
        <p className="text-caps text-clay uppercase">{eyebrow}</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">{title}</h1>
        <p className="text-body text-ink-muted" aria-live="polite">
          {page.total === 1 ? "1 produto" : `${page.total} produtos`}
        </p>
      </header>
      {children}

      <div className="grid gap-xl lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Filtros" className="flex flex-col gap-lg">
          {page.brands.length > 0 && (
            <FacetGroup title="Marca">
              {page.brands.map((facet) => (
                <FacetLink
                  key={facet.value}
                  href={href({
                    marca: toggleValue(filters.marca, facet.value),
                  })}
                  active={filters.marca.includes(facet.value)}
                  label={facet.value}
                  count={facet.count}
                />
              ))}
            </FacetGroup>
          )}
          {page.materials.length > 0 && (
            <FacetGroup title="Material e acabamento">
              {page.materials.map((facet) => (
                <FacetLink
                  key={facet.value}
                  href={href({
                    material: toggleValue(filters.material, facet.value),
                  })}
                  active={filters.material.includes(facet.value)}
                  label={facet.value}
                  count={facet.count}
                />
              ))}
            </FacetGroup>
          )}
          <FacetGroup title="Prazo de entrega">
            {page.leadTimes.map((facet) => {
              const key = facet.value as LeadTimeKey
              const active = filters.prazo === key
              return (
                <FacetLink
                  key={key}
                  href={href({ prazo: active ? undefined : key })}
                  active={active}
                  label={LEAD_TIME_OPTIONS[key].label}
                  count={facet.count}
                />
              )
            })}
          </FacetGroup>
          <form action={basePath} className="flex flex-col gap-sm">
            <p className="text-label font-medium">Faixa de preço (R$)</p>
            {filters.q && <input type="hidden" name="q" value={filters.q} />}
            {filters.marca.map((v) => (
              <input key={`m-${v}`} type="hidden" name="marca" value={v} />
            ))}
            {filters.material.map((v) => (
              <input key={`a-${v}`} type="hidden" name="material" value={v} />
            ))}
            {filters.prazo && (
              <input type="hidden" name="prazo" value={filters.prazo} />
            )}
            <div className="flex gap-sm">
              <label className="sr-only" htmlFor="preco-min">
                Preço mínimo
              </label>
              <Input
                id="preco-min"
                name="min"
                inputMode="decimal"
                placeholder="Mín."
                defaultValue={filters.min}
              />
              <label className="sr-only" htmlFor="preco-max">
                Preço máximo
              </label>
              <Input
                id="preco-max"
                name="max"
                inputMode="decimal"
                placeholder="Máx."
                defaultValue={filters.max}
              />
            </div>
            <button
              type="submit"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Aplicar preço
            </button>
          </form>
          {hasFilters && (
            <Link
              href={`${basePath}${filtersToQuery({ ...filters, marca: [], material: [], min: undefined, max: undefined, prazo: undefined, pagina: 1 })}`}
              className="text-body-sm text-primary underline"
            >
              Limpar filtros
            </Link>
          )}
        </aside>

        <section aria-label="Resultados" className="flex flex-col gap-lg">
          <nav aria-label="Ordenação" className="flex flex-wrap gap-sm">
            {Object.entries(SORT_OPTIONS).map(([key, label]) => (
              <Link
                key={key}
                href={href({ ordem: key })}
                aria-current={filters.ordem === key ? "true" : undefined}
                className={cn(
                  "rounded-full border px-md py-1 text-label-sm",
                  filters.ordem === key
                    ? "border-primary bg-primary-tint text-primary"
                    : "border-line-subtle text-ink-muted hover:text-ink"
                )}
              >
                {label}
              </Link>
            ))}
          </nav>

          {page.products.length === 0 ? (
            <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
              <h2 className="text-headline-md">Nenhum produto encontrado</h2>
              <p className="text-body text-ink-muted">
                Tente remover algum filtro ou buscar por outro termo.
              </p>
              {hasFilters && (
                <Link
                  href={`${basePath}${filtersToQuery({ ...filters, marca: [], material: [], min: undefined, max: undefined, prazo: undefined, pagina: 1 })}`}
                  className={buttonVariants({ variant: "ghost" })}
                >
                  Limpar filtros
                </Link>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-gutter-mobile md:grid-cols-3 md:gap-gutter-tablet lg:gap-gutter xl:grid-cols-4">
              {page.products.map((product) => (
                <li key={product.id}>
                  <ProductCard {...product} />
                </li>
              ))}
            </ul>
          )}

          {page.pageCount > 1 && (
            <nav
              aria-label="Paginação"
              className="flex items-center justify-center gap-sm"
            >
              {page.page > 1 && (
                <Link
                  href={href({ pagina: page.page - 1 })}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Anterior
                </Link>
              )}
              <span className="text-body-sm text-ink-muted">
                Página {page.page} de {page.pageCount}
              </span>
              {page.page < page.pageCount && (
                <Link
                  href={href({ pagina: page.page + 1 })}
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Próxima
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </PageContainer>
  )
}

/**
 * Titled group of filter links.
 *
 * @param props - Title and links.
 * @returns The group.
 */
function FacetGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-label font-medium">{title}</p>
      <ul className="flex flex-col gap-xs">{children}</ul>
    </div>
  )
}

/**
 * Filter link with the number of matching products.
 *
 * @param props - Link, state, label and count.
 * @returns The list item.
 */
function FacetLink({
  href,
  active,
  label,
  count,
}: {
  href: string
  active: boolean
  label: string
  count: number
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex justify-between gap-sm rounded px-sm py-1 text-body-sm",
          active
            ? "bg-primary-tint font-medium text-primary"
            : "text-ink hover:bg-subtle"
        )}
      >
        <span>
          <span className="sr-only">
            {active ? "Remover filtro " : "Filtrar por "}
          </span>
          {label}
        </span>
        <span className="text-ink-muted">{count}</span>
      </Link>
    </li>
  )
}
