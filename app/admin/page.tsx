import { Suspense } from "react"
import { AdminHomeView } from "@/features/backoffice/home/admin-home-view"

/**
 * Back office home with the modules available to the user.
 *
 * @returns The page.
 */
export default function AdminHomePage() {
  return (
    <Suspense fallback={<p className="text-body">Carregando painel…</p>}>
      <AdminHomeView />
    </Suspense>
  )
}
