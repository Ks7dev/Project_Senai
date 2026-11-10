import { SiteFooter } from "@/components/layout/site-footer"
import { SiteHeader } from "@/components/layout/site-header"
import {
  categoryLinks,
  institutionalLinks,
  serviceLinks,
} from "@/features/shared/config/navigation"

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
      <SiteHeader categories={categoryLinks} services={serviceLinks} />
      <div id="conteudo" className="flex flex-1 flex-col">
        {children}
      </div>
      <SiteFooter
        categories={categoryLinks}
        services={serviceLinks}
        institutional={institutionalLinks}
      />
    </>
  )
}
