import { Suspense } from "react"
import { redirect } from "next/navigation"
import { listOrderApprovals } from "@/features/orders/order-approval/action/order-approval-actions"
import { OrderApprovalView } from "@/features/orders/order-approval/order-approval-view"

export const metadata = { title: "Aprovações — Atelier Bureau" }

/**
 * Loads the orders waiting for approval and the decisions taken.
 *
 * @returns The approvals page or an access message.
 */
async function ApprovalsSection() {
  const result = await listOrderApprovals()
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect("/entrar?redirect=%2Fconta%2Faprovacoes")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <OrderApprovalView approvals={result.approvals} />
}

/**
 * Corporate order approvals route (RF11, RN01).
 *
 * @returns The page.
 */
export default function ApprovalsPage() {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Aprovações
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <ApprovalsSection />
      </Suspense>
    </>
  )
}
