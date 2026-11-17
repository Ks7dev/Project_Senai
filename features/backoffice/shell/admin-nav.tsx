import Link from "next/link"
import { visibleAdminModules } from "@/features/shared/lib/auth/permissions"
import { requireBackOfficePage } from "@/features/shared/lib/db/page-guard"

/**
 * Back office menu with only the modules the user's roles allow
 * (RF55). Reads the session, so it renders behind `<Suspense>`.
 *
 * @returns The navigation.
 */
export async function AdminNav() {
  // Login and mandatory 2FA (#177) are checked on the server
  const { user, permissions } = await requireBackOfficePage("/admin")
  const modules = visibleAdminModules(permissions)
  return (
    <nav aria-label="Módulos do back office" className="px-sm pb-md">
      <p className="px-sm pb-sm text-body-sm text-ink-muted">{user.name}</p>
      {modules.length === 0 ? (
        <p className="px-sm text-body-sm text-ink-muted">
          Nenhum módulo liberado para o seu perfil.
        </p>
      ) : (
        <ul className="flex flex-col gap-xs">
          <li>
            <Link
              href="/admin"
              className="block rounded px-sm py-2 text-label text-ink hover:bg-primary-tint"
            >
              Painel
            </Link>
          </li>
          {modules.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded px-sm py-2 text-label text-ink hover:bg-primary-tint"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}
