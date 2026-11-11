"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { AuthCard } from "@/components/layout/auth-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  lookupCnpjForSignUp,
  signUp,
} from "@/features/access/sign-up/action/sign-up"
import {
  signUpSchema,
  type SignUpData,
  type SignUpInput,
} from "@/features/access/sign-up/schema/sign-up-schema"

/**
 * Sign-up page with distinct PF (CPF) and PJ (CNPJ) flows (RF39).
 *
 * @returns The sign-up form.
 */
export function SignUpView() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<SignUpInput, unknown, SignUpData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      personType: "PF",
      name: "",
      email: "",
      cpf: "",
      phone: "",
      password: "",
      confirmPassword: "",
    } as SignUpInput,
  })
  const personType = useWatch({ control: form.control, name: "personType" })
  const errors = form.formState.errors as Partial<
    Record<string, { message?: string }>
  >
  const error = (name: string) => errors[name]?.message

  const [cnpjNotice, setCnpjNotice] = useState<{
    tone: "ok" | "warn"
    text: string
  }>()

  const checkCnpj = async (value: string) => {
    setCnpjNotice(undefined)
    if (value.replace(/\D/g, "").length !== 14) return
    const result = await lookupCnpjForSignUp({ cnpj: value })
    if (!result.success) return
    const { data } = result
    if (data.found) {
      form.setValue("legalName" as never, data.legalName as never, {
        shouldValidate: true,
      })
      setCnpjNotice(
        data.active
          ? {
              tone: "ok",
              text: "Razão social preenchida com os dados da Receita Federal.",
            }
          : {
              tone: "warn",
              text: `Situação cadastral: ${data.situation}. Só empresas ativas podem abrir conta.`,
            }
      )
    } else {
      setCnpjNotice(
        data.unavailable
          ? {
              tone: "warn",
              text: "Não foi possível consultar o CNPJ agora. Preencha a razão social.",
            }
          : { tone: "warn", text: "CNPJ não encontrado na Receita Federal." }
      )
    }
  }

  const onSubmit = form.handleSubmit((values) => {
    setServerError(undefined)
    startTransition(async () => {
      const result = await signUp(values as SignUpInput)
      if (!result.success) {
        setServerError(result.error)
        return
      }
      router.push("/conta")
      router.refresh()
    })
  })

  return (
    <AuthCard
      eyebrow="Abertura de conta"
      title="Crie a sua conta"
      description="Pessoa física compra com CPF. Empresas abrem a conta corporativa com CNPJ e convidam a equipe depois."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-md">
        <fieldset className="flex flex-col gap-sm">
          <legend className="pb-sm text-label font-medium">
            Tipo de conta
          </legend>
          <RadioGroup
            value={personType}
            onValueChange={(value) =>
              form.setValue("personType", value as "PF" | "PJ")
            }
            className="flex gap-lg"
          >
            <Label className="flex items-center gap-sm">
              <RadioGroupItem value="PF" /> Pessoa física
            </Label>
            <Label className="flex items-center gap-sm">
              <RadioGroupItem value="PJ" /> Pessoa jurídica
            </Label>
          </RadioGroup>
        </fieldset>

        {personType === "PJ" && (
          <div className="grid gap-md md:grid-cols-2">
            <FormField id="cnpj" label="CNPJ" error={error("cnpj")}>
              <Input
                id="cnpj"
                inputMode="numeric"
                autoComplete="off"
                placeholder="00.000.000/0000-00"
                {...fieldAria("cnpj", error("cnpj"))}
                {...form.register("cnpj" as never, {
                  onBlur: (event: React.FocusEvent<HTMLInputElement>) =>
                    checkCnpj(event.target.value),
                })}
              />
            </FormField>
            {cnpjNotice && (
              <p
                role="status"
                className={
                  cnpjNotice.tone === "ok"
                    ? "text-body-sm text-success md:col-span-2"
                    : "text-body-sm text-warning md:col-span-2"
                }
              >
                {cnpjNotice.text}
              </p>
            )}
            <FormField
              id="legalName"
              label="Razão social"
              error={error("legalName")}
            >
              <Input
                id="legalName"
                autoComplete="organization"
                {...fieldAria("legalName", error("legalName"))}
                {...form.register("legalName" as never)}
              />
            </FormField>
          </div>
        )}

        <div className="grid gap-md md:grid-cols-2">
          <FormField
            id="name"
            label={
              personType === "PJ" ? "Nome do responsável" : "Nome completo"
            }
            error={error("name")}
          >
            <Input
              id="name"
              autoComplete="name"
              {...fieldAria("name", error("name"))}
              {...form.register("name")}
            />
          </FormField>
          <FormField
            id="cpf"
            label={personType === "PJ" ? "CPF do responsável" : "CPF"}
            error={error("cpf")}
          >
            <Input
              id="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              {...fieldAria("cpf", error("cpf"))}
              {...form.register("cpf")}
            />
          </FormField>
          <FormField id="email" label="E-mail" error={error("email")}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              {...fieldAria("email", error("email"))}
              {...form.register("email")}
            />
          </FormField>
          <FormField
            id="phone"
            label={personType === "PJ" ? "Telefone" : "Telefone (opcional)"}
            error={error("phone")}
          >
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              {...fieldAria("phone", error("phone"))}
              {...form.register("phone")}
            />
          </FormField>
          <FormField
            id="password"
            label="Senha"
            hint="Pelo menos 10 caracteres."
            error={error("password")}
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              {...fieldAria("password", error("password"))}
              {...form.register("password")}
            />
          </FormField>
          <FormField
            id="confirmPassword"
            label="Confirme a senha"
            error={error("confirmPassword")}
          >
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...fieldAria("confirmPassword", error("confirmPassword"))}
              {...form.register("confirmPassword")}
            />
          </FormField>
        </div>

        <div className="flex flex-col gap-xs">
          <Label className="flex items-start gap-sm text-body-sm">
            <Checkbox
              onCheckedChange={(checked) =>
                form.setValue("acceptTerms", (checked === true) as true, {
                  shouldValidate: form.formState.isSubmitted,
                })
              }
              aria-describedby={
                error("acceptTerms") ? "acceptTerms-error" : undefined
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
          {error("acceptTerms") && (
            <p
              id="acceptTerms-error"
              role="alert"
              className="text-body-sm text-error"
            >
              {error("acceptTerms")}
            </p>
          )}
        </div>

        {serverError && (
          <p
            role="alert"
            className="rounded bg-error-tint p-sm text-body-sm text-error"
          >
            {serverError}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Criando conta…" : "Criar conta"}
        </Button>
        <p className="text-body-sm text-ink-muted">
          Já tem conta?{" "}
          <Link href="/entrar" className="text-primary underline">
            Entrar
          </Link>
        </p>
      </form>
    </AuthCard>
  )
}
