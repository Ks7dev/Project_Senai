"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  setInternalUserRoles,
  type InternalRole,
  type InternalUser,
} from "@/features/backoffice/internal-users/action/internal-users-actions"
import {
  internalUserRolesSchema,
  type InternalUserRolesInput,
} from "@/features/backoffice/internal-users/schema/internal-users-schema"

/**
 * Back office manager of the internal users and their profiles (RF55):
 * lists who has access, gives a profile to an existing account, changes
 * the profiles and removes the access. Presentation only; the
 * permission is checked in the Server Action.
 *
 * @param props - Profiles and users with access.
 * @returns The manager.
 */
export function InternalUsersView({
  roles,
  users,
}: {
  roles: InternalRole[]
  users: InternalUser[]
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<InternalUserRolesInput>({
    resolver: zodResolver(internalUserRolesSchema),
    defaultValues: { email: "", roles: [] },
  })
  const errors = form.formState.errors
  const roleName = (key: string) =>
    roles.find((role) => role.key === key)?.name ?? key

  const save = (values: InternalUserRolesInput, done: string) =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await setInternalUserRoles(values)
      if (!result.success) return setError(result.error)
      form.reset({ email: "", roles: [] })
      setMessage(done)
      router.refresh()
    })

  const onSubmit = form.handleSubmit((values) => save(values, "Perfis salvos."))

  return (
    <div className="flex flex-col gap-lg">
      <p className="max-w-2xl text-body text-ink-muted">
        Cada perfil abre só os módulos que as suas permissões liberam. Para dar
        acesso a alguém, a pessoa precisa ter uma conta na loja com o e-mail
        informado.
      </p>

      {message && (
        <p role="status" className="text-body-sm text-primary">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] border-collapse text-body-sm">
          <caption className="sr-only">Usuários com acesso interno</caption>
          <thead>
            <tr className="border-b border-line-subtle text-left text-ink-muted">
              <th scope="col" className="p-sm font-normal">
                Nome
              </th>
              <th scope="col" className="p-sm font-normal">
                E-mail
              </th>
              <th scope="col" className="p-sm font-normal">
                Perfis
              </th>
              <th scope="col" className="p-sm font-normal">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line-subtle">
                <th scope="row" className="p-sm text-left font-normal">
                  {user.name}
                  {user.isCurrentUser && (
                    <span className="text-ink-muted"> (você)</span>
                  )}
                </th>
                <td className="p-sm">{user.email}</td>
                <td className="p-sm">{user.roles.map(roleName).join(", ")}</td>
                <td className="p-sm">
                  <div className="flex flex-wrap gap-xs">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        form.reset({ email: user.email, roles: user.roles })
                        form.setFocus("email")
                      }}
                    >
                      Editar perfis
                      <span className="sr-only"> de {user.name}</span>
                    </Button>
                    {!user.isCurrentUser && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          save(
                            { email: user.email, roles: [] },
                            `Acesso interno de ${user.name} removido.`
                          )
                        }
                      >
                        Remover acesso
                        <span className="sr-only"> de {user.name}</span>
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex max-w-xl flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-md"
      >
        <h2 className="text-headline-sm">Definir perfis de um usuário</h2>
        <FormField
          id="internal-user-email"
          label="E-mail da conta"
          error={errors.email?.message}
        >
          <Input
            id="internal-user-email"
            type="email"
            autoComplete="off"
            {...fieldAria("internal-user-email", errors.email?.message)}
            {...form.register("email")}
          />
        </FormField>
        <fieldset className="flex flex-col gap-xs">
          <legend className="pb-xs text-label font-medium">Perfis</legend>
          {roles.map((role) => (
            <label
              key={role.key}
              className="flex items-center gap-sm text-body-sm"
            >
              <input
                type="checkbox"
                value={role.key}
                className="size-4 accent-primary"
                {...form.register("roles")}
              />
              {role.name}
              {role.managesUsers && (
                <span className="text-ink-muted">
                  (pode gerir usuários internos)
                </span>
              )}
            </label>
          ))}
          {errors.roles?.message && (
            <p role="alert" className="text-body-sm text-error">
              {errors.roles.message}
            </p>
          )}
        </fieldset>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar perfis"}
          </Button>
        </div>
      </form>
    </div>
  )
}
