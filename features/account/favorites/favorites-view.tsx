import Link from "next/link"
import { ProductCard } from "@/components/commerce/product-card"
import { buttonVariants } from "@/components/ui/button"
import type { ProductCardData } from "@/features/shared/lib/catalog/catalog-query"
import { CompareButton } from "@/features/shared/components/compare-controls"
import { FavoriteButton } from "@/features/shared/components/favorite-button"

/**
 * Favorites list of the customer area (#38, RF45).
 *
 * @param props - Favorite product cards.
 * @returns The list or the empty state.
 */
export function FavoritesView({ products }: { products: ProductCardData[] }) {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Favoritos
        </h1>
      </header>
      {products.length === 0 ? (
        <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
          <p className="text-body text-ink-muted">
            Você ainda não tem favoritos. Toque no coração de um produto para
            guardá-lo aqui.
          </p>
          <Link href="/busca" className={buttonVariants({ variant: "ghost" })}>
            Explorar produtos
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-gutter-mobile md:grid-cols-3 md:gap-gutter-tablet lg:gap-gutter">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard
                {...product}
                actions={
                  <>
                    <FavoriteButton
                      productId={product.id}
                      productName={product.name}
                      size="sm"
                    />
                    <CompareButton slug={product.slug} name={product.name} />
                  </>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
