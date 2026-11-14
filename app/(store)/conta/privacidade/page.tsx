import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PrivacyView } from "@/features/account/privacy/privacy-view"
import { getCurrentUser } from "@/features/shared/lib/auth/session"

export const metadata = { title: "Privacidade — Atelier Bureau" }

/**
 * Checks the session before showing the privacy tools.
 *
 * @returns The privacy section.
 */
async function PrivacySection() {
  const user = await getCurrentUser()
  if (!user) redirect("/entrar?redirect=%2Fconta%2Fprivacidade")
  return <PrivacyView />
}

/**
 * Privacy route of the customer area (#75, RF56).
 *
 * @returns The page.
 */
export default function PrivacyPage() {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Privacidade e meus dados
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <PrivacySection />
      </Suspense>
    </>
  )
}
