import { Suspense } from "react"
import { getInstallmentRules } from "@/features/payment/installments/action/installment-actions"
import { InstallmentsView } from "@/features/payment/installments/installments-view"
import { requirePagePermission } from "@/features/shared/lib/db/page-guard"

export const metadata = { title: "Parcelamento — Atelier Bureau" }

/**
 * Loads the installment ranges after checking the permission.
 *
 * @returns The editor or the error message.
 */
async function InstallmentsSection() {
  await requirePagePermission("setting:manage", "/admin/parcelamento")
  const result = await getInstallmentRules()
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <InstallmentsView rules={result.rules} updatedAt={result.updatedAt} />
}

/**
 * Back office route of the card installments (#56, RF14).
 *
 * @returns The page.
 */
export default function AdminInstallmentsPage() {
  return (
    <div className="flex flex-col gap-lg">
      <header>
        <p className="text-caps text-clay uppercase">Pagamento</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Parcelamento no cartão
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando faixas…</p>}>
        <InstallmentsSection />
      </Suspense>
    </div>
  )
}
