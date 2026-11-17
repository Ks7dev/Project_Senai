import Link from "next/link"
import { visibleAdminModules } from "@/features/shared/lib/auth/permissions"
import { requireBackOfficePage } from "@/features/shared/lib/db/page-guard"

/**
 * Back office home: greets the user and lists the modules allowed for
 * their profile. Reads the session, so it renders behind `<Suspense>`.
 *
 * @returns The home content.
 */
export async function AdminHomeView() {
  // Login and mandatory 2FA (#177) are checked on the server
  const { user, permissions } = await requireBackOfficePage("/admin")
  const modules = visibleAdminModules(permissions)

  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Back office</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Olá, {user.name}
        </h1>
      </header>
      {modules.length === 0 ? (
        <p className="text-body text-ink-muted">
          Seu perfil ainda não tem módulos liberados. Fale com um administrador.
        </p>
      ) : (
        <ul className="grid gap-md md:grid-cols-2 lg:grid-cols-3">
          {modules.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="block rounded-lg border border-line-subtle bg-elevated p-md text-subhead text-ink hover:shadow-1"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
