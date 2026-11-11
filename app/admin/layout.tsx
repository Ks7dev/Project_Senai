import { Suspense } from "react"
import Link from "next/link"
import { AdminNav } from "@/features/backoffice/shell/admin-nav"

/**
 * Back office layout: sidebar with the modules allowed for the user
 * and the page content. Pages check their own permission on the
 * server (requirePagePermission); the menu only hides what is denied.
 *
 * @param props - Layout props with the rendered route as children.
 * @returns The back office shell.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <aside className="border-b border-line-subtle bg-subtle lg:w-64 lg:border-r lg:border-b-0">
        <div className="flex h-16 items-center px-md">
          <Link
            href="/admin"
            className="rounded font-serif text-headline-sm text-ink"
          >
            Atelier Bureau
          </Link>
          <span className="ml-sm text-caps text-clay uppercase">Admin</span>
        </div>
        <Suspense
          fallback={<p className="px-md text-body-sm">Carregando menu…</p>}
        >
          <AdminNav />
        </Suspense>
      </aside>
      <main id="conteudo" className="flex-1 p-margin-mobile lg:p-xl">
        {children}
      </main>
    </div>
  )
}
