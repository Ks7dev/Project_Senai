"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useFieldArray, useForm } from "react-hook-form"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { saveInstallmentRules } from "@/features/payment/installments/action/installment-actions"
import {
  installmentRulesFormSchema,
  type InstallmentRulesFormData,
  type InstallmentRulesFormInput,
} from "@/features/payment/installments/schema/installments-schema"
import {
  MAX_CARD_INSTALLMENTS,
  type InstallmentRule,
} from "@/features/shared/schema/installment-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const PROFILE_LABEL = { PF: "Pessoa física", PJ: "Pessoa jurídica" } as const

/**
 * Converts the saved ranges into form values.
 *
 * @param rules - Saved ranges.
 * @returns The form values.
 */
function toForm(rules: InstallmentRule[]): InstallmentRulesFormInput {
  return {
    rules: rules.map((rule) => ({
      profile: rule.profile,
      minTotal: rule.minTotal.replace(".", ","),
      maxInstallments: String(rule.maxInstallments),
    })),
  }
}

/**
 * Back office editor of the card installments (RF14): maximum number of
 * installments by order amount range and customer profile. The payment
 * Brick only offers the installments allowed here, and the payment
 * action refuses anything above it. Presentation only.
 *
 * @param props - Saved ranges and the last change date.
 * @returns The editor.
 */
export function InstallmentsView({
  rules,
  updatedAt,
}: {
  rules: InstallmentRule[]
  updatedAt: string | null
}) {
  const router = useRouter()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<
    InstallmentRulesFormInput,
    unknown,
    InstallmentRulesFormData
  >({
    resolver: zodResolver(installmentRulesFormSchema),
    defaultValues: toForm(rules),
  })
  const ranges = useFieldArray({ control: form.control, name: "rules" })
  const errors = form.formState.errors

  const onSubmit = form.handleSubmit(() =>
    startTransition(async () => {
      setError(undefined)
      setMessage(undefined)
      const result = await saveInstallmentRules(form.getValues())
      if (!result.success) return setError(result.error)
      form.reset(toForm(result.rules))
      setMessage("Faixas de parcelamento salvas.")
      router.refresh()
    })
  )

  return (
    <div className="flex flex-col gap-lg">
      <p className="max-w-2xl text-body text-ink-muted">
        Cada faixa vale a partir do valor mínimo do pedido, até a próxima faixa
        do mesmo perfil. Pedidos de contas corporativas usam as faixas de pessoa
        jurídica. O formulário de pagamento mostra só as parcelas permitidas.
      </p>

      <section
        aria-label="Faixas atuais"
        className="grid gap-md md:grid-cols-2"
      >
        {(["PF", "PJ"] as const).map((profile) => (
          <div
            key={profile}
            className="flex flex-col gap-xs rounded-lg border border-line-subtle bg-elevated p-md"
          >
            <h2 className="text-headline-sm">{PROFILE_LABEL[profile]}</h2>
            <ul className="text-body-sm text-ink">
              {rules
                .filter((rule) => rule.profile === profile)
                .map((rule) => (
                  <li key={rule.minTotal}>
                    A partir de {brl.format(Number(rule.minTotal))}: até{" "}
                    {rule.maxInstallments}{" "}
                    {rule.maxInstallments === 1 ? "parcela" : "parcelas"}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>
      {updatedAt && (
        <p className="text-label-sm text-ink-muted">
          Última alteração em{" "}
          {new Date(updatedAt).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
          })}
        </p>
      )}

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

      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-md rounded-lg border border-line-subtle bg-elevated p-lg"
      >
        <h2 className="text-headline-md">Editar faixas</h2>
        {errors.rules?.message && (
          <p role="alert" className="text-body-sm text-error">
            {errors.rules.message}
          </p>
        )}
        {errors.rules?.root?.message && (
          <p role="alert" className="text-body-sm text-error">
            {errors.rules.root.message}
          </p>
        )}
        {ranges.fields.map((range, index) => {
          const rowErrors = errors.rules?.[index]
          return (
            <div key={range.id} className="flex flex-wrap items-end gap-sm">
              <FormField
                id={`rule-profile-${index}`}
                label="Perfil"
                error={rowErrors?.profile?.message}
                className="min-w-40 flex-1"
              >
                <select
                  id={`rule-profile-${index}`}
                  className="h-11 rounded border border-line bg-canvas px-md text-body text-ink focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-primary/12 focus-visible:outline-none"
                  {...fieldAria(
                    `rule-profile-${index}`,
                    rowErrors?.profile?.message
                  )}
                  {...form.register(`rules.${index}.profile`)}
                >
                  <option value="PF">{PROFILE_LABEL.PF}</option>
                  <option value="PJ">{PROFILE_LABEL.PJ}</option>
                </select>
              </FormField>
              <FormField
                id={`rule-min-${index}`}
                label="A partir de (R$)"
                error={rowErrors?.minTotal?.message}
                className="min-w-36 flex-1"
              >
                <Input
                  id={`rule-min-${index}`}
                  inputMode="decimal"
                  {...fieldAria(
                    `rule-min-${index}`,
                    rowErrors?.minTotal?.message
                  )}
                  {...form.register(`rules.${index}.minTotal`)}
                />
              </FormField>
              <FormField
                id={`rule-max-${index}`}
                label={`Máximo de parcelas (1 a ${MAX_CARD_INSTALLMENTS})`}
                error={rowErrors?.maxInstallments?.message}
                className="min-w-36 flex-1"
              >
                <Input
                  id={`rule-max-${index}`}
                  inputMode="numeric"
                  {...fieldAria(
                    `rule-max-${index}`,
                    rowErrors?.maxInstallments?.message
                  )}
                  {...form.register(`rules.${index}.maxInstallments`)}
                />
              </FormField>
              <Button
                type="button"
                variant="ghost"
                onClick={() => ranges.remove(index)}
                disabled={ranges.fields.length === 1}
                aria-label={`Remover faixa ${index + 1}`}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
          )
        })}
        <div className="flex flex-wrap gap-sm">
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              ranges.append({
                profile: "PF",
                minTotal: "",
                maxInstallments: "",
              })
            }
          >
            <PlusIcon aria-hidden /> Nova faixa
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando…" : "Salvar faixas"}
          </Button>
        </div>
      </form>
    </div>
  )
}
