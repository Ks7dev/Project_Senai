"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { AuthCard } from "@/components/layout/auth-card"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  signIn,
  verifyTwoFactor,
} from "@/features/access/sign-in/action/sign-in"
import {
  signInSchema,
  type SignInInput,
} from "@/features/access/sign-in/schema/sign-in-schema"
import {
  twoFactorCodeSchema,
  type TwoFactorCodeInput,
} from "@/features/shared/schema/two-factor-code-schema"

type SignInViewProps = {
  /** Safe internal path to open after login. */
  redirectTo: string
}

/**
 * Login with e-mail and password, followed by the authenticator code
 * when the account has 2FA enabled (RF39, RF40).
 *
 * @param props - Destination after login.
 * @returns The login form.
 */
export function SignInView({ redirectTo }: SignInViewProps) {
  const router = useRouter()
  const [step, setStep] = useState<"password" | "code">("password")
  const [serverError, setServerError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const passwordForm = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })
  const codeForm = useForm<TwoFactorCodeInput>({
    resolver: zodResolver(twoFactorCodeSchema),
    defaultValues: { code: "" },
  })

  const finish = () => {
    router.push(redirectTo)
    router.refresh()
  }

  const onPassword = passwordForm.handleSubmit((values) => {
    setServerError(undefined)
    startTransition(async () => {
      const result = await signIn(values)
      if (!result.success) return setServerError(result.error)
      if (result.twoFactor) return setStep("code")
      finish()
    })
  })

  const onCode = codeForm.handleSubmit((values) => {
    setServerError(undefined)
    startTransition(async () => {
      const result = await verifyTwoFactor(values)
      if (!result.success) return setServerError(result.error)
      finish()
    })
  })

  const emailError = passwordForm.formState.errors.email?.message
  const passwordError = passwordForm.formState.errors.password?.message
  const codeError = codeForm.formState.errors.code?.message

  return (
    <AuthCard
      eyebrow={step === "password" ? "Acesso" : "Verificação em duas etapas"}
      title={step === "password" ? "Entre na sua conta" : "Confirme o acesso"}
      description={
        step === "code"
          ? "Digite o código de 6 números do seu aplicativo autenticador."
          : undefined
      }
    >
      {step === "password" ? (
        <form onSubmit={onPassword} noValidate className="flex flex-col gap-md">
          <FormField id="email" label="E-mail" error={emailError}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...fieldAria("email", emailError)}
              {...passwordForm.register("email")}
            />
          </FormField>
          <FormField id="password" label="Senha" error={passwordError}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              {...fieldAria("password", passwordError)}
              {...passwordForm.register("password")}
            />
          </FormField>
          {serverError && (
            <p
              role="alert"
              className="rounded bg-error-tint p-sm text-body-sm text-error"
            >
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Entrando…" : "Entrar"}
          </Button>
          <div className="flex flex-wrap justify-between gap-sm text-body-sm">
            <Link href="/recuperar-senha" className="text-primary underline">
              Esqueci a senha
            </Link>
            <Link href="/cadastro" className="text-primary underline">
              Criar conta
            </Link>
          </div>
        </form>
      ) : (
        <form onSubmit={onCode} noValidate className="flex flex-col gap-md">
          <FormField id="code" label="Código de verificação" error={codeError}>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              {...fieldAria("code", codeError)}
              {...codeForm.register("code")}
            />
          </FormField>
          {serverError && (
            <p
              role="alert"
              className="rounded bg-error-tint p-sm text-body-sm text-error"
            >
              {serverError}
            </p>
          )}
          <Button type="submit" disabled={pending}>
            {pending ? "Verificando…" : "Confirmar"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
