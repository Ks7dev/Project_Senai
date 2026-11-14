import { Suspense } from "react"
import Link from "next/link"
import { listCreditAccounts } from "@/features/finance/credit-approval/action/credit-approval-actions"
import { CreditApprovalView } from "@/features/finance/credit-approval/credit-approval-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Crédito corporativo — Atelier Bureau" }

/**
 * Loads the corporate accounts after checking the permission.
 *
 * @returns The credit desk or the error message.
 */
async function CreditSection() {
  await requirePagePermission("credit:approve", "/admin/financeiro/credito")
  const result = await listCreditAccounts()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <CreditApprovalView accounts={result.accounts} />
}

/**
 * Back office route of the corporate credit approval (#61, RF58, RN10).
 *
 * @returns The page.
 */
export default function AdminCreditPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header className="flex flex-col gap-xs">
        <Link
          href="/admin/financeiro"
          className="text-body-sm text-primary underline"
        >
          Financeiro
        </Link>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Crédito corporativo
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando contas…</p>}>
        <CreditSection />
      </Suspense>
    </div>
  )
}
