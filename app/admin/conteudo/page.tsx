import { Suspense } from "react"
import { getHomeContentForEdit } from "@/features/backoffice/home-content/action/home-content-actions"
import { HomeContentView } from "@/features/backoffice/home-content/home-content-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

/**
 * Loads the home content after checking the permission.
 *
 * @returns The editor.
 */
async function ContentSection() {
  await requirePagePermission("content:manage", "/admin/conteudo")
  const result = await getHomeContentForEdit()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <HomeContentView content={result.content} />
}

/**
 * Back office home content route (#30).
 *
 * @returns The page.
 */
export default function AdminContentPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Conteúdo</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Home da loja
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <ContentSection />
      </Suspense>
    </div>
  )
}
