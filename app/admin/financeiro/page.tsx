import { Suspense } from "react"
import { FinanceHomeView } from "@/features/finance/finance-home/finance-home-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Financeiro — Atelier Bureau" }

/**
 * Checks the permission and lists the finance sections of the user.
 *
 * @returns The sections.
 */
async function FinanceSections() {
  const { permissions } = await requirePagePermission(
    "payment:refund",
    "/admin/financeiro"
  )
  return <FinanceHomeView granted={permissions} />
}

/**
 * Back office route of the finance module (RF58, RF33, RF34).
 *
 * @returns The page.
 */
export default function AdminFinancePage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Back office</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Financeiro
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <FinanceSections />
      </Suspense>
    </div>
  )
}
