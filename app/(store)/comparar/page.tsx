import { Suspense } from "react"
import { CompareView } from "@/features/catalog/compare/compare-view"
import { getComparisonProducts } from "@/features/shared/lib/catalog/catalog-query"

export const metadata = { title: "Comparar produtos — Atelier Bureau" }

/**
 * Loads the products named in the "p" query parameter.
 *
 * @param props - Search params promise.
 * @returns The comparison.
 */
async function Comparison({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { p } = await searchParams
  const slugs = (Array.isArray(p) ? p.join(",") : (p ?? ""))
    .split(",")
    .map((slug) => slug.trim())
    .filter((slug) => /^[a-z0-9-]{1,191}$/.test(slug))
  return <CompareView products={await getComparisonProducts(slugs)} />
}

/**
 * Product comparison route (#27, RF04).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function ComparePage(props: PageProps<"/comparar">) {
  return (
    <Suspense fallback={<p className="p-xl text-body">Carregando…</p>}>
      <Comparison searchParams={props.searchParams} />
    </Suspense>
  )
}
