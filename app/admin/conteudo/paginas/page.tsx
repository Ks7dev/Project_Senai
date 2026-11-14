import { Suspense } from "react"
import Link from "next/link"
import { listInstitutionalPages } from "@/features/backoffice/institutional-pages/action/institutional-page-actions"
import { InstitutionalPagesView } from "@/features/backoffice/institutional-pages/institutional-pages-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Páginas institucionais — Atelier Bureau" }

/**
 * Loads the institutional pages after checking the permission.
 *
 * @returns The editor or the error message.
 */
async function PagesSection() {
  await requirePagePermission("content:manage", "/admin/conteudo/paginas")
  const result = await listInstitutionalPages()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <InstitutionalPagesView pages={result.pages} />
}

/**
 * Back office route of the institutional pages (#74, RF57).
 *
 * @returns The page.
 */
export default function AdminInstitutionalPagesPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <p className="text-caps text-clay uppercase">Conteúdo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Páginas institucionais
        </h1>
        <Link
          href="/admin/conteudo"
          className="text-body-sm text-primary underline"
        >
          Voltar para a home da loja
        </Link>
      </header>
      <Suspense fallback={<p className="text-body">Carregando páginas…</p>}>
        <PagesSection />
      </Suspense>
    </div>
  )
}
