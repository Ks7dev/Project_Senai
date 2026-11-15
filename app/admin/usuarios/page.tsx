import { Suspense } from "react"
import { listInternalUsers } from "@/features/backoffice/internal-users/action/internal-users-actions"
import { InternalUsersView } from "@/features/backoffice/internal-users/internal-users-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Usuários internos — Atelier Bureau" }

/**
 * Loads the internal users after checking the permission.
 *
 * @returns The manager or the error message.
 */
async function InternalUsersSection() {
  await requirePagePermission("user:manage", "/admin/usuarios")
  const result = await listInternalUsers()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <InternalUsersView roles={result.roles} users={result.users} />
}

/**
 * Back office route of the internal users and profiles (#72, RF55).
 *
 * @returns The page.
 */
export default function AdminInternalUsersPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Acesso</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Usuários internos
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando usuários…</p>}>
        <InternalUsersSection />
      </Suspense>
    </div>
  )
}
