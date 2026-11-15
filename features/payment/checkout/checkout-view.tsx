"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  BarcodeIcon,
  CreditCardIcon,
  QrCodeIcon,
  TruckIcon,
} from "lucide-react"
import { OrderSummary } from "@/components/commerce/order-summary"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  placeOrder,
  quoteCheckoutShipping,
  type CheckoutContext,
  type CheckoutOption,
  type CheckoutQuote,
} from "@/features/payment/checkout/action/checkout-actions"
import type { CheckoutPaymentMethod } from "@/features/payment/checkout/schema/checkout-schema"
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
 * Key of a shipping option in the radio group.
 *
 * @param option - Shipping option.
 * @returns A stable key.
 */
function optionKey(option: CheckoutOption): string {
  return `${option.method}|${option.carrier}|${option.service}`
}

/**
 * Icon of a payment method.
 *
 * @param props - Method key.
 * @returns The icon.
 */
function MethodIcon({ method }: { method: CheckoutPaymentMethod }) {
  const className = "size-5 shrink-0 text-primary"
  if (method === "PIX") return <QrCodeIcon className={className} aria-hidden />
  if (method === "BOLETO") {
    return <BarcodeIcon className={className} aria-hidden />
  }
  return <CreditCardIcon className={className} aria-hidden />
}

/**
 * Checkout (RF25, RF28, RF29): the customer reviews the cart, picks a
 * saved address, a shipping option and the payment method, and places
 * the order. Presentation only: the quote, the totals and the order run
 * in Server Actions, which check everything again.
 *
 * @param props - Cart, saved addresses and payment methods.
 * @returns The checkout content.
 */
export function CheckoutView({ context }: { context: CheckoutContext }) {
  const id = useId()
  const router = useRouter()
  const [addressId, setAddressId] = useState("")
  const [quote, setQuote] = useState<CheckoutQuote>()
  const [selected, setSelected] = useState("")
  const [method, setMethod] = useState<CheckoutPaymentMethod | "">(
    context.paymentMethods.length === 1 ? context.paymentMethods[0].method : ""
  )
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const { cart } = context
  const option =
    quote?.status === "quoted"
      ? quote.options.find((item) => optionKey(item) === selected)
      : undefined
  const shipping =
    quote?.status === "manual_quote" ? "0.00" : (option?.price ?? undefined)
  const total =
    quote?.status === "manual_quote"
      ? quote.total
      : (option?.total ?? cart.total)
  const needsApproval =
    context.approvalLimit !== null &&
    Number(total) > Number(context.approvalLimit)

  const requote = (nextAddressId: string) => {
    setError(undefined)
    setQuote(undefined)
    setSelected("")
    startTransition(async () => {
      const result = await quoteCheckoutShipping({ addressId: nextAddressId })
      if (!result.success) return setError(result.error)
      setQuote(result.quote)
      if (result.quote.status === "quoted" && result.quote.options[0]) {
        setSelected(optionKey(result.quote.options[0]))
      }
    })
  }

  const submit = () => {
    if (!addressId) return setError("Escolha o endereço de entrega.")
    if (!quote) return setError("Aguarde o cálculo do frete.")
    if (quote.status === "quoted" && !option) {
      return setError("Escolha uma opção de frete.")
    }
    if (!method) return setError("Escolha a forma de pagamento.")
    setError(undefined)
    startTransition(async () => {
      const result = await placeOrder({
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
        expectedTotal: total,
        paymentMethod: method,
      })
      if (!result.success) return setError(result.error)
      router.push(result.order.nextUrl)
    })
  }

  if (cart.lines.length === 0) {
    return (
      <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
        <p className="text-body text-ink-muted">Seu carrinho está vazio.</p>
        <Link href="/busca" className={buttonVariants()}>
          Explorar produtos
        </Link>
      </div>
    )
  }

  return (
    <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-lg">
        <section aria-labelledby={`${id}-items`} className="flex flex-col">
          <h2 id={`${id}-items`} className="mb-sm text-headline-sm">
            Itens
          </h2>
          <ul className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle">
            {cart.lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap justify-between gap-sm p-sm text-body-sm"
              >
                <span>
                  <strong className="block text-ink">{line.productName}</strong>
                  <span className="text-ink-muted">
                    {line.skuName} · {line.quantity}{" "}
                    {line.quantity === 1 ? "unidade" : "unidades"}
                    {!line.purchasable && " · Indisponível"}
                  </span>
                </span>
                <span className="text-ink">
                  {brl.format(Number(line.total))}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/carrinho"
            className="mt-xs text-body-sm text-primary underline"
          >
            Alterar itens no carrinho
          </Link>
        </section>

        <fieldset className="flex flex-col gap-sm">
          <legend className="mb-sm text-headline-sm">
            Endereço de entrega
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
          {pending && addressId && !quote && (
            <p className="text-body-sm text-ink-muted">Calculando o frete…</p>
          )}
          {quote?.status === "quoted" && (
            <fieldset className="flex flex-col gap-xs">
              <legend className="mb-sm text-headline-sm">Frete</legend>
              {quote.options.map((item) => (
                <label
                  key={optionKey(item)}
                  className="flex cursor-pointer flex-wrap items-center gap-sm rounded bg-subtle p-sm text-body-sm has-checked:bg-primary-tint"
                >
                  <input
                    type="radio"
                    name={`${id}-option`}
                    value={optionKey(item)}
                    checked={selected === optionKey(item)}
                    onChange={() => setSelected(optionKey(item))}
                    className="accent-primary"
                  />
                  <TruckIcon className="size-5 text-primary" aria-hidden />
                  <span className="flex-1">
                    {item.service}
                    <span className="block text-ink-muted">
                      {item.carrier} · {deliveryTimeMessage(item)}
                    </span>
                  </span>
                  <strong>{brl.format(Number(item.price))}</strong>
                </label>
              ))}
            </fieldset>
          )}
          {quote?.status === "manual_quote" && (
            <p className="rounded bg-clay-tint p-sm text-body-sm text-ink">
              {manualQuoteReasonMessage(quote.reason)}{" "}
              {manualQuoteResponseMessage(quote.responseBusinessDays)} Você pode
              confirmar o pedido agora: os itens ficam reservados e o pagamento
              é liberado quando o frete for cotado.
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-xs">
          <legend className="mb-sm text-headline-sm">Forma de pagamento</legend>
          {context.paymentMethods.map((item) => (
            <label
              key={item.method}
              className="flex cursor-pointer items-start gap-sm rounded border border-line-subtle p-sm text-body-sm has-checked:border-primary has-checked:bg-primary-tint"
            >
              <input
                type="radio"
                name={`${id}-payment`}
                value={item.method}
                checked={method === item.method}
                onChange={() => setMethod(item.method)}
                className="mt-1 accent-primary"
              />
              <MethodIcon method={item.method} />
              <span>
                <strong className="block">{item.label}</strong>
                <span className="text-ink-muted">{item.note}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>

      <aside className="flex flex-col gap-md">
        <OrderSummary
          subtotal={cart.subtotal}
          services={cart.servicesTotal}
          shipping={shipping}
          total={total}
          note={
            quote?.status === "manual_quote"
              ? "Frete a cotar pela equipe comercial."
              : undefined
          }
        />
        {needsApproval && (
          <p
            role="note"
            className="rounded bg-subtle p-sm text-body-sm text-ink"
          >
            Pedidos acima de {brl.format(Number(context.approvalLimit))}{" "}
            precisam da aprovação da empresa antes do pagamento.
          </p>
        )}
        {error && (
          <p role="alert" className="text-body-sm text-error">
            {error}
          </p>
        )}
        <Button
          type="button"
          onClick={submit}
          disabled={pending || !quote || !addressId}
        >
          {pending && quote ? "Confirmando pedido…" : "Confirmar pedido"}
        </Button>
        <p className="text-label-sm text-ink-muted">
          Ao confirmar, os itens ficam reservados e você segue para o pagamento.
        </p>
      </aside>
    </div>
  )
}
