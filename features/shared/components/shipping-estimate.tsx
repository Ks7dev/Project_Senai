"use client"

import { useId, useState, useTransition } from "react"
import { MapPinIcon, TruckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { quoteShipping } from "@/features/shared/lib/shipping/shipping-actions"
import {
  coverageMessage,
  deliveryTimeMessage,
  manualQuoteReasonMessage,
} from "@/features/shared/lib/shipping/shipping-messages"
import type { ShippingQuote } from "@/features/shared/lib/shipping/strategies"
import {
  INVALID_CEP_MESSAGE,
  isValidCep,
} from "@/features/shared/schema/cep-schema"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

type ShippingEstimateProps = {
  /** Order lines by SKU code. */
  items: Array<{ skuCode: string; quantity: number }>
  /** CEP to start with, e.g. the default address of the customer. */
  initialCep?: string
}

/**
 * Shipping calculation by CEP (RF25) with the coverage notice of the
 * own delivery and assembly area (RF27, RN16). Used on the product
 * page and in the checkout; when no price is available it explains
 * that the sales team will quote the shipping (RN20).
 *
 * @param props - Order lines and the initial CEP.
 * @returns The shipping block.
 */
export function ShippingEstimate({
  items,
  initialCep = "",
}: ShippingEstimateProps) {
  const id = useId()
  const [cep, setCep] = useState(initialCep)
  const [quote, setQuote] = useState<ShippingQuote>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    setQuote(undefined)
    if (!isValidCep(cep)) return setError(INVALID_CEP_MESSAGE)
    setError(undefined)
    startTransition(async () => {
      const result = await quoteShipping({ cep, items })
      if (!result.success) return setError(result.error)
      setQuote(result.quote)
    })
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-sm border-t border-line-subtle pt-md"
    >
      <h2 id={`${id}-title`} className="text-label">
        Calcular frete
      </h2>
      <form
        onSubmit={onSubmit}
        noValidate
        className="flex flex-wrap items-end gap-sm"
      >
        <FormField
          id={`${id}-cep`}
          label="CEP de entrega"
          error={error}
          className="min-w-40 flex-1"
        >
          <Input
            id={`${id}-cep`}
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={cep}
            onChange={(event) => setCep(event.target.value)}
            {...fieldAria(`${id}-cep`, error)}
          />
        </FormField>
        <Button type="submit" variant="ghost" disabled={pending}>
          {pending ? "Calculando…" : "Calcular"}
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-sm">
        {quote && (
          <p className="flex gap-sm text-body-sm text-ink">
            <MapPinIcon className="size-5 shrink-0 text-primary" aria-hidden />
            {coverageMessage(quote.coverage)}
          </p>
        )}
        {quote?.status === "quoted" && (
          <ul className="flex flex-col gap-xs">
            {quote.options.map((option) => (
              <li
                key={`${option.method}-${option.service}`}
                className="flex flex-wrap items-center gap-sm rounded bg-subtle p-sm text-body-sm"
              >
                <TruckIcon className="size-5 text-primary" aria-hidden />
                <span className="flex-1">
                  {option.service}
                  <span className="block text-ink-muted">
                    {option.carrier} · {deliveryTimeMessage(option)}
                  </span>
                </span>
                <strong>{brl.format(Number(option.price))}</strong>
              </li>
            ))}
          </ul>
        )}
        {quote?.status === "manual_quote" && (
          <p className="rounded bg-clay-tint p-sm text-body-sm text-ink">
            {manualQuoteReasonMessage(quote.reason)}
          </p>
        )}
      </div>
    </section>
  )
}
