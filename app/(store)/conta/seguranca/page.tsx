import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PageContainer } from "@/components/layout/page-container"
import { getSecurityStatus } from "@/features/access/security/action/two-factor"
import { SecurityView } from "@/features/access/security/security-view"

export const metadata = { title: "Segurança da conta — Atelier Bureau" }

/**
 * Loads the 2FA status of the logged-in user.
 *
 * @returns The security section.
 */
async function SecuritySection() {
  const status = await getSecurityStatus()
  if (!status) redirect("/entrar?redirect=%2Fconta%2Fseguranca")
  return <SecurityView status={status} />
}

/**
 * Account security route: password and 2FA (RF40).
 *
 * @returns The page.
 */
export default function SecurityPage() {
  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Dados e segurança
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <SecuritySection />
      </Suspense>
    </PageContainer>
  )
}
