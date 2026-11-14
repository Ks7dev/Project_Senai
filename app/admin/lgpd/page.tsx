import { Suspense } from "react"
import { PrivacyRequestsView } from "@/features/backoffice/privacy-requests/privacy-requests-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "LGPD — Atelier Bureau" }

/**
 * Checks the permission before showing the LGPD tools.
 *
 * @returns The module.
 */
async function PrivacySection() {
  await requirePagePermission("privacy:manage", "/admin/lgpd")
  return <PrivacyRequestsView />
}

/**
 * Back office route of the titular requests (#75, RF56).
 *
 * @returns The page.
 */
export default function AdminPrivacyPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">LGPD</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Direitos do titular
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <PrivacySection />
      </Suspense>
    </div>
  )
}
