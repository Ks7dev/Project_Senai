"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  cancelInvitation,
  inviteMember,
  removeMember,
  updateMemberRoles,
  type TeamData,
} from "@/features/access/corporate-members/action/members-actions"
import {
  CORPORATE_ROLES,
  type CorporateRole,
} from "@/features/shared/lib/auth/corporate-roles"

const ROLE_KEYS = Object.keys(CORPORATE_ROLES) as CorporateRole[]

/**
 * Role checkboxes shared by the invite form and each member row.
 *
 * @param props - Field id prefix, selected roles and change handler.
 * @returns The fieldset.
 */
function RolePicker({
  idPrefix,
  legend,
  value,
  onChange,
}: {
  idPrefix: string
  legend: string
  value: CorporateRole[]
  onChange: (roles: CorporateRole[]) => void
}) {
  return (
    <fieldset className="flex flex-wrap gap-md">
      <legend className="sr-only">{legend}</legend>
      {ROLE_KEYS.map((role) => (
        <Label
          key={role}
          htmlFor={`${idPrefix}-${role}`}
          className="flex items-center gap-xs text-body-sm"
        >
          <Checkbox
            id={`${idPrefix}-${role}`}
            checked={value.includes(role)}
            onCheckedChange={(checked) =>
              onChange(
                checked === true
                  ? [...value, role]
                  : value.filter((item) => item !== role)
              )
            }
          />
          {CORPORATE_ROLES[role]}
        </Label>
      ))}
    </fieldset>
  )
}

/**
 * Corporate account team page (#34, #35): members with their roles,
 * pending invitations and the invite form. RN08 is enforced on the
 * server; the page shows its error messages.
 *
 * @param props - Team data.
 * @returns The page content.
 */
export function TeamView({ team }: { team: TeamData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRoles, setInviteRoles] = useState<CorporateRole[]>(["requester"])
  const [drafts, setDrafts] = useState<Record<string, CorporateRole[]>>({})

  const run = (
    action: () => Promise<{ success: boolean; error?: string }>,
    success: string
  ) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await action()
      if (!result.success) return setError(result.error)
      setMessage(success)
      router.refresh()
    })

  return (
    <div className="flex flex-col gap-xl">
      <section aria-labelledby="membros" className="flex flex-col gap-md">
        <h2 id="membros" className="text-headline-md">
          Usuários de {team.organizationName}
        </h2>
        <p className="text-body-sm text-ink-muted">
          Contas com mais de um usuário precisam de pelo menos um aprovador e um
          administrador.
        </p>
        <ul className="flex flex-col gap-sm">
          {team.members.map((member) => {
            const roles = drafts[member.id] ?? member.roles
            const changed =
              drafts[member.id] !== undefined &&
              [...roles].sort().join() !== [...member.roles].sort().join()
            return (
              <li
                key={member.id}
                className="flex flex-col gap-sm rounded-lg border border-line-subtle bg-elevated p-md"
              >
                <div className="flex flex-wrap items-center gap-sm">
                  <span className="text-subhead text-ink">{member.name}</span>
                  <span className="text-body-sm text-ink-muted">
                    {member.email}
                  </span>
                  {member.isCurrentUser && (
                    <Badge variant="outline">Você</Badge>
                  )}
                </div>
                <RolePicker
                  idPrefix={`member-${member.id}`}
                  legend={`Perfis de ${member.name}`}
                  value={roles}
                  onChange={(next) =>
                    setDrafts({ ...drafts, [member.id]: next })
                  }
                />
                <div className="flex flex-wrap gap-sm">
                  <Button
                    size="sm"
                    disabled={pending || !changed}
                    onClick={() =>
                      run(
                        () => updateMemberRoles({ memberId: member.id, roles }),
                        "Perfis atualizados."
                      )
                    }
                  >
                    Salvar perfis
                  </Button>
                  {!member.isCurrentUser && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => removeMember({ id: member.id }),
                          "Usuário removido da conta."
                        )
                      }
                    >
                      Remover da conta
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section
        aria-labelledby="convidar"
        className="flex flex-col gap-md rounded-lg border border-line-subtle bg-subtle p-lg"
      >
        <h2 id="convidar" className="text-headline-sm">
          Convidar usuário
        </h2>
        <FormField id="invite-email" label="E-mail">
          <Input
            id="invite-email"
            type="email"
            autoComplete="off"
            value={inviteEmail}
            onChange={(event) => setInviteEmail(event.target.value)}
          />
        </FormField>
        <RolePicker
          idPrefix="invite"
          legend="Perfis do convidado"
          value={inviteRoles}
          onChange={setInviteRoles}
        />
        <Button
          className="self-start"
          disabled={pending || !inviteEmail}
          onClick={() =>
            run(async () => {
              const result = await inviteMember({
                email: inviteEmail,
                roles: inviteRoles,
              })
              if (result.success) setInviteEmail("")
              return result
            }, "Convite enviado por e-mail. O link vale por 7 dias.")
          }
        >
          Enviar convite
        </Button>
      </section>

      {team.invitations.length > 0 && (
        <section aria-labelledby="pendentes" className="flex flex-col gap-sm">
          <h2 id="pendentes" className="text-headline-sm">
            Convites pendentes
          </h2>
          <ul className="flex flex-col gap-xs">
            {team.invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center gap-sm text-body-sm"
              >
                <span className="flex-1">
                  {invitation.email} ·{" "}
                  {invitation.roles.map((r) => CORPORATE_ROLES[r]).join(", ")} ·
                  vence em{" "}
                  {new Date(invitation.expiresAt).toLocaleDateString("pt-BR")}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => cancelInvitation({ id: invitation.id }),
                      "Convite cancelado."
                    )
                  }
                >
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p
          role="alert"
          className="rounded bg-error-tint p-sm text-body-sm text-error"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-body-sm text-success">
          {message}
        </p>
      )}
    </div>
  )
}
