import { Suspense } from "react"
import { redirect } from "next/navigation"
import { listMyProjectLists } from "@/features/cart/project-lists/action/project-list-actions"
import { ProjectListsView } from "@/features/cart/project-lists/project-lists-view"
import { getCurrentUser } from "@/features/shared/lib/auth/session"

export const metadata = { title: "Listas de projeto — Atelier Bureau" }

/**
 * Loads the saved project lists of the logged-in user (id from the
 * session).
 *
 * @returns The lists.
 */
async function ProjectLists() {
  const user = await getCurrentUser()
  if (!user) redirect("/entrar?redirect=%2Fconta%2Flistas")
  const result = await listMyProjectLists()
  if (!result.success) {
    return <p className="text-body text-destructive">{result.error}</p>
  }
  return <ProjectListsView lists={result.lists} />
}

/**
 * Saved project lists route (#46, RF07).
 *
 * @returns The page.
 */
export default function ProjectListsPage() {
  return (
    <Suspense fallback={<p className="text-body">Carregando listas…</p>}>
      <ProjectLists />
    </Suspense>
  )
}
