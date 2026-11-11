import { Suspense } from "react"
import { redirect } from "next/navigation"
import { FavoritesView } from "@/features/account/favorites/favorites-view"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { getFavoriteCards } from "@/features/shared/lib/catalog/catalog-query"

export const metadata = { title: "Favoritos — Atelier Bureau" }

/**
 * Loads the favorites of the logged-in user (id from the session).
 *
 * @returns The favorites list.
 */
async function Favorites() {
  const user = await getCurrentUser()
  if (!user) redirect("/entrar?redirect=%2Fconta%2Ffavoritos")
  return <FavoritesView products={await getFavoriteCards(user.id)} />
}

/**
 * Customer favorites route (#38, RF45).
 *
 * @returns The page.
 */
export default function AccountFavoritesPage() {
  return (
    <Suspense fallback={<p className="text-body">Carregando favoritos…</p>}>
      <Favorites />
    </Suspense>
  )
}
