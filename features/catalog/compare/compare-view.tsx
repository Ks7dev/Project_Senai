import Link from "next/link"
import { PageContainer } from "@/components/layout/page-container"
import { buttonVariants } from "@/components/ui/button"
import {
  buildComparisonRows,
  type ComparisonProduct,
} from "@/features/shared/lib/catalog/comparison-rows"
import { CompareButton } from "@/features/shared/components/compare-controls"

/**
 * Comparison page (#27, RF04): up to four products side by side, with
 * the specifications aligned by attribute. On small screens the table
 * scrolls sideways and the attribute column stays fixed.
 *
 * @param props - Compared products.
 * @returns The page content.
 */
export function CompareView({ products }: { products: ComparisonProduct[] }) {
  if (products.length < 2) {
    return (
      <PageContainer className="flex flex-col items-start gap-md py-xl">
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Comparar produtos
        </h1>
        <p className="text-body text-ink-muted">
          Escolha ao menos dois produtos nas listagens, pelo botão “Comparar”,
          para vê-los lado a lado.
        </p>
        <Link href="/busca" className={buttonVariants({ variant: "ghost" })}>
          Explorar produtos
        </Link>
      </PageContainer>
    )
  }
  const rows = buildComparisonRows(products)
  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Comparação</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Comparar produtos
        </h1>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-body-sm">
          <caption className="sr-only">
            Comparação de {products.length} produtos
          </caption>
          <thead>
            <tr>
              <td className="sticky left-0 bg-canvas" />
              {products.map((product) => (
                <th
                  key={product.slug}
                  scope="col"
                  className="p-sm text-left align-top font-normal"
                >
                  <div className="flex flex-col gap-sm">
                    <div className="aspect-[4/5] w-full max-w-48 overflow-hidden rounded-lg bg-subtle">
                      {product.imageKey && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/media/${product.imageKey}-320.webp`}
                          alt={product.imageAlt}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <Link
                      href={`/produto/${product.slug}`}
                      className="text-headline-sm text-ink hover:underline"
                    >
                      {product.name}
                    </Link>
                    <CompareButton slug={product.slug} name={product.name} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-line-subtle">
                <th
                  scope="row"
                  className="sticky left-0 bg-canvas p-sm text-left font-normal text-ink-muted"
                >
                  {row.label}
                </th>
                {row.values.map((value, index) => (
                  <td key={products[index].slug} className="p-sm text-ink">
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageContainer>
  )
}
