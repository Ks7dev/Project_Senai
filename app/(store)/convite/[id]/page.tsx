import { Suspense } from "react"
import { AuthCard } from "@/components/layout/auth-card"
import { getInvitation } from "@/features/access/corporate-members/action/members-actions"
import { InvitationView } from "@/features/access/corporate-members/invitation-view"

export const metadata = { title: "Convite — Atelier Bureau" }

/**
 * Loads the invitation.
 *
 * @param props - Route params promise.
 * @returns The invitation page or the invalid link message.
 */
async function InvitationSection({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await getInvitation({ id })
  if (!result.success) {
    return (
      <AuthCard eyebrow="Convite" title="Convite indisponível">
        <p role="alert" className="text-body text-ink-muted">
          {result.error}
        </p>
      </AuthCard>
    )
  }
  return <InvitationView invitation={result.invitation} />
}

/**
 * Corporate account invitation route (#34).
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function InvitationPage(props: PageProps<"/convite/[id]">) {
  return (
    <Suspense fallback={<p className="p-xl text-body">Carregando convite…</p>}>
      <InvitationSection params={props.params} />
    </Suspense>
  )
}
