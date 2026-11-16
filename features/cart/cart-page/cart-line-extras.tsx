"use client"

import { useId, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { setCartItemExtras } from "@/features/cart/cart-page/action/cart-page-actions"
import { setCartItemExtrasSchema } from "@/features/cart/cart-page/schema/cart-page-schema"
import {
  isServiceEligible,
  type CartExtrasRules,
} from "@/features/shared/lib/cart/cart-extras"
import type { CartLine, CartView } from "@/features/shared/lib/cart/cart-types"
import { PERSONALIZATION_CANCELLATION_NOTICE } from "@/features/shared/lib/orders/cancellation"
import type { Personalization } from "@/features/shared/schema/cart-schema"
import { cn } from "@/lib/utils"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

const FONT_LABELS: Record<Personalization["font"], string> = {
  serif: "Clássica",
  script: "Cursiva",
}

/**
 * Text for the extra lead time.
 *
 * @param days - Business days.
 * @returns E.g. "+3 dias úteis".
 */
function extraDaysLabel(days: number): string {
  return `+${days} ${days === 1 ? "dia útil" : "dias úteis"}`
}

type CartLineExtrasProps = {
  /** Cart line. */
  line: CartLine
  /** Engraving and service rules from the settings table. */
  rules: CartExtrasRules
  /** Called with the updated cart after saving. */
  onSaved: (cart: CartView) => void
}

/**
 * Laser engraving with a live preview and the additional services of a
 * cart line (RF51, RF52), with cost and extra lead time per unit. The
 * customer is told that personalized items cannot be canceled once
 * production starts (RN24).
 *
 * @param props - Line, rules and the save callback.
 * @returns The extras section, or nothing when the line has no options.
 */
export function CartLineExtras({ line, rules, onSaved }: CartLineExtrasProps) {
  const id = useId()
  const services = rules.services.filter((rule) =>
    isServiceEligible(rule, line)
  )
  const [engrave, setEngrave] = useState(line.personalization !== null)
  const [text, setText] = useState(line.personalization?.text ?? "")
  const [font, setFont] = useState<Personalization["font"]>(
    line.personalization?.font ?? "serif"
  )
  const [chosen, setChosen] = useState(
    line.services.map((service) => service.key)
  )
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()

  if (!line.purchasable || (!line.personalizable && services.length === 0)) {
    return null
  }

  const textError =
    engrave && text.trim().length > rules.engraving.maxLength
      ? `Use até ${rules.engraving.maxLength} caracteres na gravação.`
      : undefined

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)
    const parsed = setCartItemExtrasSchema.safeParse({
      itemId: line.id,
      personalization: engrave ? { type: "laser_engraving", text, font } : null,
      services: chosen,
    })
    if (!parsed.success) {
      return setError(parsed.error.issues[0]?.message ?? "Revise os dados.")
    }
    if (textError) return setError(textError)
    startTransition(async () => {
      const result = await setCartItemExtras(parsed.data)
      if (!result.success) return setError(result.error)
      setMessage("Personalização e serviços atualizados.")
      onSaved(result.cart)
    })
  }

  const toggleService = (key: string, checked: boolean) =>
    setChosen((current) =>
      checked ? [...current, key] : current.filter((item) => item !== key)
    )

  return (
    <details
      className="mt-sm rounded border border-line-subtle"
      open={line.personalization !== null || line.services.length > 0}
    >
      <summary className="cursor-pointer px-sm py-xs text-label text-ink">
        Personalização e serviços
      </summary>
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-col gap-md border-t border-line-subtle p-sm"
      >
        {line.personalizable && (
          <fieldset className="flex flex-col gap-sm">
            <legend className="sr-only">Gravação a laser</legend>
            <Label className="flex items-start gap-sm text-body-sm">
              <Checkbox
                checked={engrave}
                onCheckedChange={(checked) => setEngrave(checked === true)}
              />
              <span>
                Gravação a laser · {brl.format(Number(rules.engraving.price))}{" "}
                por unidade ·{" "}
                {extraDaysLabel(rules.engraving.extraBusinessDays)} no prazo
              </span>
            </Label>
            {engrave && (
              <>
                <FormField
                  id={`${id}-text`}
                  label="Texto da gravação"
                  hint={`Até ${rules.engraving.maxLength} caracteres.`}
                  error={textError}
                >
                  <Input
                    id={`${id}-text`}
                    value={text}
                    maxLength={rules.engraving.maxLength}
                    onChange={(event) => setText(event.target.value)}
                    {...fieldAria(`${id}-text`, textError)}
                  />
                </FormField>
                <div className="flex flex-col gap-xs">
                  <span id={`${id}-font`} className="text-label">
                    Estilo
                  </span>
                  <RadioGroup
                    aria-labelledby={`${id}-font`}
                    value={font}
                    onValueChange={(value) =>
                      setFont(value as Personalization["font"])
                    }
                    className="flex gap-lg"
                  >
                    {(["serif", "script"] as const).map((option) => (
                      <Label key={option} className="flex items-center gap-sm">
                        <RadioGroupItem value={option} /> {FONT_LABELS[option]}
                      </Label>
                    ))}
                  </RadioGroup>
                </div>
                <figure className="flex flex-col gap-xs">
                  <figcaption className="text-label">Prévia</figcaption>
                  <div
                    role="img"
                    aria-label={`Prévia da gravação: ${text.trim() || "sem texto"}`}
                    className="flex min-h-20 items-center justify-center rounded bg-clay-tint px-md py-sm text-center"
                  >
                    <span
                      className={cn(
                        "text-headline-sm tracking-wide break-all text-ink",
                        font === "serif" ? "font-serif" : "font-serif italic"
                      )}
                    >
                      {text.trim() || "Seu texto aqui"}
                    </span>
                  </div>
                </figure>
                <p className="text-body-sm text-ink-muted">
                  {PERSONALIZATION_CANCELLATION_NOTICE}
                </p>
              </>
            )}
          </fieldset>
        )}

        {services.length > 0 && (
          <fieldset className="flex flex-col gap-sm">
            <legend className="pb-xs text-label">Serviços adicionais</legend>
            {services.map((service) => (
              <Label
                key={service.key}
                className="flex items-start gap-sm text-body-sm"
              >
                <Checkbox
                  checked={chosen.includes(service.key)}
                  onCheckedChange={(checked) =>
                    toggleService(service.key, checked === true)
                  }
                />
                <span>
                  {service.label} ·{" "}
                  {service.courtesy
                    ? "Cortesia"
                    : `${brl.format(Number(service.price))} por unidade`}
                  {service.extraBusinessDays > 0 &&
                    ` · ${extraDaysLabel(service.extraBusinessDays)} no prazo`}
                  {service.description && (
                    <span className="block text-ink-muted">
                      {service.description}
                    </span>
                  )}
                </span>
              </Label>
            ))}
          </fieldset>
        )}

        <div className="flex flex-wrap items-center gap-sm">
          <Button type="submit" variant="ghost" size="sm" disabled={pending}>
            {pending ? "Salvando…" : "Salvar escolhas"}
          </Button>
          <p
            role="alert"
            className="text-body-sm text-destructive empty:hidden"
          >
            {error}
          </p>
          <p role="status" className="text-body-sm text-ink empty:hidden">
            {message}
          </p>
        </div>
      </form>
    </details>
  )
}
