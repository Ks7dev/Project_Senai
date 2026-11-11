"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { AuthCard } from "@/components/layout/auth-card"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  requestPasswordReset,
  resetPassword,
} from "@/features/access/password-reset/action/password-reset"
import {
  requestResetSchema,
  resetPasswordSchema,
  type RequestResetInput,
  type ResetPasswordInput,
} from "@/features/access/password-reset/schema/password-reset-schema"

/**
 * Form that sends the password reset link by e-mail (RF40).
 *
 * @returns The request form.
 */
export function RequestResetView() {
  const [sent, setSent] = useState(false)
  const [serverError, setServerError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<RequestResetInput>({
    resolver: zodResolver(requestResetSchema),
    defaultValues: { email: "" },
  })
  const emailError = form.formState.errors.email?.message

  const onSubmit = form.handleSubmit((values) => {
    setServerError(undefined)
    startTransition(async () => {
      const result = await requestPasswordReset(values)
      if (!result.success) return setServerError(result.error)
      setSent(true)
    })
  })

  return (
    <AuthCard
      eyebrow="Recuperação de acesso"
      title="Esqueceu a senha?"
      description="Informe o e-mail da conta. Se ele estiver cadastrado, enviaremos um link válido por 1 hora."
    >
      {sent ? (
        <p role="status" className="rounded bg-primary-tint p-md text-body">
          Se houver uma conta com esse e-mail, o link de redefinição chega em
          instantes. Confira também a caixa de spam.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-md">
          <FormField id="email" label="E-mail" error={emailError}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...fieldAria("email", emailError)}
              {...form.register("email")}
            />
          </FormField>
          {serverError && (
            <p role="alert" className="text-body-sm text-error">
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Enviando…" : "Enviar link"}
          </Button>
        </form>
      )}
      <Link href="/entrar" className="text-body-sm text-primary underline">
        Voltar para o login
      </Link>
    </AuthCard>
  )
}

type ResetPasswordViewProps = {
  /** Token from the e-mailed link; empty when the link is broken. */
  token: string
}

/**
 * Form that sets the new password with the e-mailed token (RF40).
 *
 * @param props - Reset token.
 * @returns The reset form.
 */
export function ResetPasswordView({ token }: ResetPasswordViewProps) {
  const [done, setDone] = useState(false)
  const [serverError, setServerError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  })
  const passwordError = form.formState.errors.password?.message
  const confirmError = form.formState.errors.confirmPassword?.message

  const onSubmit = form.handleSubmit((values) => {
    setServerError(undefined)
    startTransition(async () => {
      const result = await resetPassword(values)
      if (!result.success) return setServerError(result.error)
      setDone(true)
    })
  })

  return (
    <AuthCard eyebrow="Recuperação de acesso" title="Defina uma nova senha">
      {!token ? (
        <p role="alert" className="text-body text-error">
          Link inválido. Peça um novo link de redefinição.
        </p>
      ) : done ? (
        <p role="status" className="rounded bg-primary-tint p-md text-body">
          Senha alterada. Por segurança, as outras sessões foram encerradas.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-md">
          <FormField
            id="password"
            label="Nova senha"
            hint="Pelo menos 10 caracteres."
            error={passwordError}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...fieldAria("password", passwordError)}
              {...form.register("password")}
            />
          </FormField>
          <FormField
            id="confirmPassword"
            label="Confirme a nova senha"
            error={confirmError}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...fieldAria("confirmPassword", confirmError)}
              {...form.register("confirmPassword")}
            />
          </FormField>
          {serverError && (
            <p role="alert" className="text-body-sm text-error">
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar nova senha"}
          </Button>
        </form>
      )}
      <Link href="/entrar" className="text-body-sm text-primary underline">
        Ir para o login
      </Link>
    </AuthCard>
  )
}
