import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getTeam } from "@/features/access/corporate-members/action/members-actions"
import { TeamView } from "@/features/access/corporate-members/team-view"

export const metadata = { title: "Usuários da empresa — Atelier Bureau" }

/**
 * Loads the corporate account team.
 *
 * @returns The team page or an access message.
 */
async function TeamSection() {
  const result = await getTeam()
  if (!result.success) {
    if (result.error.startsWith("Entre na sua conta")) {
      redirect("/entrar?redirect=%2Fconta%2Fusuarios")
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <TeamView team={result.team} />
}

/**
 * Corporate account users and roles route (#34, #35).
 *
 * @returns The page.
 */
export default function TeamPage() {
  return (
    <>
      <header>
        <p className="text-caps text-clay uppercase">Minha conta</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Usuários e perfis
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando…</p>}>
        <TeamSection />
      </Suspense>
    </>
  )
}
