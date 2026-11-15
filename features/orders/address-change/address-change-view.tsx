"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { MapPinIcon, TruckIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  confirmAddressChange,
  quoteAddressChange,
  type AddressChangeContext,
  type AddressChangeQuote,
  type RequotedOption,
} from "@/features/orders/address-change/action/address-change-actions"
import { ORDER_STATUS } from "@/features/shared/lib/orders/order-status"
import {
  deliveryTimeMessage,
  manualQuoteReasonMessage,
  manualQuoteResponseMessage,
} from "@/features/shared/lib/shipping/shipping-messages"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Describes a price difference for the customer.
 *
 * @param difference - New minus current shipping, decimal string.
 * @returns "+ R$ 10,00", "− R$ 5,00" or "Sem diferença".
 */
function differenceLabel(difference: string): string {
  const value = Number(difference)
  if (value === 0) return "Sem diferença no frete"
  const amount = brl.format(Math.abs(value))
  return value > 0 ? `+ ${amount} no frete` : `− ${amount} no frete`
}

/**
 * Key of an option in the radio group.
 *
 * @param option - Shipping option.
 * @returns A stable key.
 */
function optionKey(option: RequotedOption): string {
  return `${option.method}|${option.carrier}|${option.service}`
}

/**
 * Change of the delivery address of an order (RN15, #45): the customer
 * picks a saved address, sees the new shipping and delivery time with
 * the difference to the current one, and confirms before the order
 * goes on. Presentation only: the quote and the change run in Server
 * Actions.
 *
 * @param props - The order and the saved addresses.
 * @returns The address change page content.
 */
export function AddressChangeView({
  context,
}: {
  context: AddressChangeContext
}) {
  const id = useId()
  const router = useRouter()
  const [addressId, setAddressId] = useState("")
  const [quote, setQuote] = useState<AddressChangeQuote>()
  const [selected, setSelected] = useState("")
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()
  const [pending, startTransition] = useTransition()

  const requote = (nextAddressId = addressId) => {
    setError(undefined)
    setQuote(undefined)
    setSelected("")
    if (!nextAddressId) return setError("Escolha o novo endereço de entrega.")
    startTransition(async () => {
      const result = await quoteAddressChange({
        orderId: context.orderId,
        addressId: nextAddressId,
      })
      if (!result.success) return setError(result.error)
      setQuote(result.quote)
      if (result.quote.status === "quoted" && result.quote.options[0]) {
        setSelected(optionKey(result.quote.options[0]))
      }
    })
  }

  const confirm = () => {
    if (!quote) return
    const option =
      quote.status === "quoted"
        ? quote.options.find((item) => optionKey(item) === selected)
        : undefined
    if (quote.status === "quoted" && !option) {
      return setError("Escolha uma opção de frete.")
    }
    setError(undefined)
    startTransition(async () => {
      const result = await confirmAddressChange({
        orderId: context.orderId,
        addressId,
        option: option
          ? {
              method: option.method as
                "CORREIOS_PAC" | "CORREIOS_SEDEX" | "CARRIER" | "OWN_DELIVERY",
              carrier: option.carrier,
              service: option.service,
            }
          : null,
        expectedShippingPrice: option ? option.price : "0.00",
      })
      if (!result.success) {
        setError(result.error)
        return
      }
      setQuote(undefined)
      setDone(
        result.status === "AWAITING_SHIPPING_QUOTE"
          ? "Endereço alterado. O frete do novo endereço será cotado pela nossa equipe comercial e você receberá o valor por e-mail."
          : `Endereço alterado. Novo total do pedido: ${brl.format(Number(result.total))}.`
      )
      router.refresh()
    })
  }

  const { shipping } = context

  return (
    <div className="flex flex-col gap-lg">
      <section
        aria-labelledby={`${id}-current`}
        className="flex flex-col gap-xs rounded-lg border border-line-subtle bg-elevated p-md"
      >
        <h2 id={`${id}-current`} className="text-label">
          Entrega atual
        </h2>
        <p className="flex gap-sm text-body-sm text-ink">
          <MapPinIcon className="size-5 shrink-0 text-primary" aria-hidden />
          {context.currentAddress}
        </p>
        <p className="text-body-sm text-ink-muted">
          {shipping.service
            ? `${shipping.service} · ${shipping.carrier ?? ""} · `
            : "Frete a cotar · "}
          Frete {brl.format(Number(shipping.price))} · Total{" "}
          {brl.format(Number(context.total))}
        </p>
        <p className="text-body-sm text-ink-muted">
          Status: {ORDER_STATUS[context.status].label}
        </p>
      </section>

      {done && (
        <p
          role="status"
          className="rounded bg-primary-tint p-sm text-body-sm text-ink"
        >
          {done}
        </p>
      )}

      {!context.changeable ? (
        <p role="note" className="rounded bg-subtle p-sm text-body-sm text-ink">
          O endereço deste pedido não pode mais ser alterado pelo site. Fale com
          o atendimento.
        </p>
      ) : (
        <>
          <fieldset className="flex flex-col gap-sm">
            <legend className="mb-sm text-label">
              Novo endereço de entrega
            </legend>
            {context.addresses.length === 0 && (
              <p className="text-body-sm text-ink-muted">
                Você ainda não tem endereços cadastrados.
              </p>
            )}
            {context.addresses.map((address) => (
              <label
                key={address.id}
                className="flex cursor-pointer items-start gap-sm rounded border border-line-subtle p-sm text-body-sm has-checked:border-primary has-checked:bg-primary-tint"
              >
                <input
                  type="radio"
                  name={`${id}-address`}
                  value={address.id}
                  checked={addressId === address.id}
                  onChange={() => {
                    setAddressId(address.id)
                    setDone(undefined)
                    requote(address.id)
                  }}
                  className="mt-1 accent-primary"
                />
                <span>
                  <strong className="block">{address.label}</strong>
                  {address.line}
                </span>
              </label>
            ))}
            <Link
              href="/conta/enderecos"
              className="text-body-sm text-primary underline"
            >
              Cadastrar outro endereço
            </Link>
          </fieldset>

          <div aria-live="polite" className="flex flex-col gap-sm">
            {pending && !quote && (
              <p className="text-body-sm text-ink-muted">
                Calculando o novo frete…
              </p>
            )}
            {quote?.status === "quoted" && (
              <fieldset className="flex flex-col gap-xs">
                <legend className="mb-sm text-label">
                  Novo frete para {quote.newAddress}
                </legend>
                {quote.options.map((option) => (
                  <label
                    key={optionKey(option)}
                    className="flex cursor-pointer flex-wrap items-center gap-sm rounded bg-subtle p-sm text-body-sm has-checked:bg-primary-tint"
                  >
                    <input
                      type="radio"
                      name={`${id}-option`}
                      value={optionKey(option)}
                      checked={selected === optionKey(option)}
                      onChange={() => setSelected(optionKey(option))}
                      className="accent-primary"
                    />
                    <TruckIcon className="size-5 text-primary" aria-hidden />
                    <span className="flex-1">
                      {option.service}
                      <span className="block text-ink-muted">
                        {option.carrier} · {deliveryTimeMessage(option)}
                      </span>
                    </span>
                    <span className="text-right">
                      <strong className="block">
                        {brl.format(Number(option.price))}
                      </strong>
                      <span className="block text-ink-muted">
                        {differenceLabel(option.difference)} · Total{" "}
                        {brl.format(Number(option.newTotal))}
                      </span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {quote?.status === "manual_quote" && (
              <p className="rounded bg-clay-tint p-sm text-body-sm text-ink">
                {manualQuoteReasonMessage(quote.reason)}{" "}
                {manualQuoteResponseMessage(quote.responseBusinessDays)} Até lá,
                o total do pedido fica em {brl.format(Number(quote.newTotal))},
                sem o frete.
              </p>
            )}
            {error && (
              <p role="alert" className="text-body-sm text-error">
                {error}
              </p>
            )}
          </div>

          {quote && (
            <div className="flex flex-wrap gap-sm">
              <Button type="button" onClick={confirm} disabled={pending}>
                {pending ? "Confirmando…" : "Confirmar novo endereço e frete"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => requote()}
                disabled={pending}
              >
                Recalcular
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
