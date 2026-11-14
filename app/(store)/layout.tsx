import { Suspense } from "react"
import { unstable_rethrow } from "next/navigation"
import { connection } from "next/server"
import { CartDrawer } from "@/components/commerce/cart-drawer"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { CompareBar } from "@/features/shared/components/compare-controls"
import { getMenuCategoryLinks } from "@/features/app/shell/store-navigation"
import { loadCurrentCart } from "@/features/shared/lib/cart/cart-store"
import { logger } from "@/features/shared/lib/logger/logger"
import {
  categoryLinks,
  institutionalLinks,
  serviceLinks,
} from "@/features/shared/config/navigation"

/**
 * Cart drawer of the header with the active cart (#46): the account
 * cart when logged in, the visitor cart otherwise. Falls back to an
 * empty drawer if the database is unavailable.
 *
 * @returns The drawer.
 */
async function HeaderCart() {
  // Request time only: the cart is never read during the build
  await connection()
  const cart = await loadCurrentCart().catch((error: unknown) => {
    unstable_rethrow(error)
    logger.error("header cart unavailable", { error })
    return null
  })
  const lines = cart?.lines.filter((line) => line.purchasable) ?? []
  return (
    <CartDrawer
      subtotal={cart?.subtotal ?? "0.00"}
      services={cart?.servicesTotal}
      discount={cart?.discount}
      total={cart?.total}
      items={lines.map((line) => ({
        sku: line.skuCode,
        name: line.productName,
        variant: line.skuName,
        quantity: line.quantity,
        total: line.total,
        imageKey: line.imageKey,
      }))}
    />
  )
}

/**
 * Header with the category menu managed in the back office (#23) and
 * the cart drawer (#46).
 *
 * @returns The header.
 */
async function StoreHeader() {
  const [categories, cart] = await Promise.all([
    getMenuCategoryLinks(),
    HeaderCart(),
  ])
  return (
    <SiteHeader categories={categories} services={serviceLinks} cart={cart} />
  )
}

/**
 * Footer with the category links managed in the back office (#23).
 *
 * @returns The footer.
 */
async function StoreFooter() {
  const categories = await getMenuCategoryLinks()
  return (
    <SiteFooter
      categories={categories}
      services={serviceLinks}
      institutional={institutionalLinks}
    />
  )
}

/**
 * Store layout: skip link, header, page content and institutional
 * footer, shared by every public store route.
 *
 * @param props - Layout props with the rendered route as children.
 * @returns The store shell.
 */
export default function StoreLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#conteudo"
        className="sr-only z-50 rounded bg-primary px-md py-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-sm focus:left-sm"
      >
        Pular para o conteúdo
      </a>
      <Suspense
        fallback={
          <SiteHeader categories={categoryLinks} services={serviceLinks} />
        }
      >
        <StoreHeader />
      </Suspense>
      <div id="conteudo" className="flex flex-1 flex-col">
        {children}
      </div>
      <Suspense
        fallback={
          <SiteFooter
            categories={categoryLinks}
            services={serviceLinks}
            institutional={institutionalLinks}
          />
        }
      >
        <StoreFooter />
      </Suspense>
      <CompareBar />
    </>
  )
}
