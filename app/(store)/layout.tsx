import { Suspense } from "react"
import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import { getMenuCategoryLinks } from "@/features/app/shell/store-navigation"
import {
  categoryLinks,
  institutionalLinks,
  serviceLinks,
} from "@/features/shared/config/navigation"

/**
 * Header with the category menu managed in the back office (#23).
 *
 * @returns The header.
 */
async function StoreHeader() {
  const categories = await getMenuCategoryLinks()
  return <SiteHeader categories={categories} services={serviceLinks} />
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
    </>
  )
}
