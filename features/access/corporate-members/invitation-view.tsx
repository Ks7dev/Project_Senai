"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { AuthCard } from "@/components/layout/auth-card"
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  acceptInvitation,
  acceptInvitationWithSignUp,
  type InvitationView as Invitation,
} from "@/features/access/corporate-members/action/members-actions"
import {
  acceptWithSignUpSchema,
  type AcceptWithSignUpInput,
} from "@/features/access/corporate-members/schema/members-schema"
import { CORPORATE_ROLES } from "@/features/shared/lib/auth/corporate-roles"

/**
 * Invitation acceptance page (#34): accepts with the logged-in account,
 * asks to log in, or creates the account and joins the company.
 *
 * @param props - Invitation data.
 * @returns The page content.
 */
export function InvitationView({ invitation }: { invitation: Invitation }) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<AcceptWithSignUpInput>({
    resolver: zodResolver(acceptWithSignUpSchema),
    defaultValues: {
      invitationId: invitation.id,
      name: "",
      cpf: "",
      phone: "",
      password: "",
      confirmPassword: "",
    } as AcceptWithSignUpInput,
  })
  const errors = form.formState.errors
  const roles = invitation.roles.map((role) => CORPORATE_ROLES[role]).join(", ")

  const done = () => {
    router.push("/conta")
    router.refresh()
  }

  const onSignUp = form.handleSubmit((values) =>
    startTransition(async () => {
      setError(undefined)
      const result = await acceptInvitationWithSignUp(values)
      if (!result.success) return setError(result.error)
      done()
    })
  )

  return (
    <AuthCard
      eyebrow="Convite"
      title={`Junte-se a ${invitation.organizationName}`}
      description={`Convite para ${invitation.email}, com o perfil: ${roles}.`}
    >
      {invitation.mode === "accept" && (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setError(undefined)
              const result = await acceptInvitation({ id: invitation.id })
              if (!result.success) return setError(result.error)
              done()
            })
          }
        >
          Aceitar convite
        </Button>
      )}

      {invitation.mode === "login" && (
        <Link
          href={`/entrar?redirect=${encodeURIComponent(`/convite/${invitation.id}`)}`}
          className={buttonVariants()}
        >
          Entrar para aceitar
        </Link>
      )}

      {invitation.mode === "wrong-user" && (
        <p role="alert" className="text-body text-error">
          Você está conectado com outro e-mail. Saia e entre com{" "}
          {invitation.email} para aceitar.
        </p>
      )}

      {invitation.mode === "sign-up" && (
        <form onSubmit={onSignUp} noValidate className="flex flex-col gap-md">
          <div className="grid gap-md md:grid-cols-2">
            <FormField
              id="name"
              label="Nome completo"
              error={errors.name?.message}
            >
              <Input
                id="name"
                autoComplete="name"
                {...fieldAria("name", errors.name?.message)}
                {...form.register("name")}
              />
            </FormField>
            <FormField id="cpf" label="CPF" error={errors.cpf?.message}>
              <Input
                id="cpf"
                inputMode="numeric"
                {...fieldAria("cpf", errors.cpf?.message)}
                {...form.register("cpf")}
              />
            </FormField>
            <FormField
              id="phone"
              label="Telefone"
              error={errors.phone?.message}
            >
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                {...fieldAria("phone", errors.phone?.message)}
                {...form.register("phone")}
              />
            </FormField>
            <FormField
              id="password"
              label="Senha"
              hint="Pelo menos 10 caracteres."
              error={errors.password?.message}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                {...fieldAria("password", errors.password?.message)}
                {...form.register("password")}
              />
            </FormField>
            <FormField
              id="confirmPassword"
              label="Confirme a senha"
              error={errors.confirmPassword?.message}
            >
              <Input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                {...fieldAria(
                  "confirmPassword",
                  errors.confirmPassword?.message
                )}
                {...form.register("confirmPassword")}
              />
            </FormField>
          </div>
          <Label className="flex items-start gap-sm text-body-sm">
            <Checkbox
              onCheckedChange={(checked) =>
                form.setValue("acceptTerms", (checked === true) as true)
              }
            />
            <span>
              Li e aceito os{" "}
              <Link href="/termos-de-uso" className="underline">
                termos de uso
              </Link>{" "}
              e a{" "}
              <Link href="/politica-de-privacidade" className="underline">
                política de privacidade
              </Link>
              .
            </span>
          </Label>
          {errors.acceptTerms && (
            <p role="alert" className="text-body-sm text-error">
              {errors.acceptTerms.message}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Criando conta…" : "Criar conta e aceitar"}
          </Button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          className="rounded bg-error-tint p-sm text-body-sm text-error"
        >
          {error}
        </p>
      )}
    </AuthCard>
  )
}
