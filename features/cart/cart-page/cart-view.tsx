"use client"

import { useId, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { OrderSummary } from "@/components/commerce/order-summary"
import { PageContainer } from "@/components/layout/page-container"
import { Button, buttonVariants } from "@/components/ui/button"
import { FormField, fieldAria } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import {
  applyCartCoupon,
  quoteCartShipping,
  removeCartCoupon,
  removeCartItem,
  saveCartAsProjectList,
  updateCartItem,
  type CartPromotions,
} from "@/features/cart/cart-page/action/cart-page-actions"
import {
  applyCouponSchema,
  saveProjectListSchema,
  type ApplyCouponInput,
  type SaveProjectListInput,
} from "@/features/cart/cart-page/schema/cart-page-schema"
import { CartLineExtras } from "@/features/cart/cart-page/cart-line-extras"
import { PromotionsNote } from "@/features/shared/components/promotions-note"
import { ShippingEstimate } from "@/features/shared/components/shipping-estimate"
import type { CartExtrasRules } from "@/features/shared/lib/cart/cart-extras"
import { MAX_LINE_QUANTITY } from "@/features/shared/lib/cart/cart-math"
import type { CartLine, CartView } from "@/features/shared/lib/cart/cart-types"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

type CartPageViewProps = {
  /** Active cart. */
  cart: CartView
  /** Whether the customer is logged in (only they keep project lists). */
  loggedIn: boolean
  /** Engraving and additional service rules (RF51, RF52). */
  rules: CartExtrasRules
  /** Promotions in force on the cart (RF46), or null when unavailable. */
  promotions: CartPromotions | null
}

/**
 * Cart page (#46, RF07): lines with quantity and removal, laser
 * engraving and additional services (#47, RF51, RF52), order summary
 * with the extras cost and lead time, promotions and coupon (#73, RF46),
 * shipping estimate by CEP with free shipping rules (RN23) and the
 * option to save the cart as a project list to resume later.
 *
 * @param props - Cart, login state, extras rules and promotions.
 * @returns The page content.
 */
export function CartPageView({
  cart: initialCart,
  loggedIn,
  rules,
  promotions,
}: CartPageViewProps) {
  const router = useRouter()
  const [cart, setCart] = useState(initialCart)
  const discount = promotions?.discount ?? "0.00"
  const total = promotions?.total ?? cart.total
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const run = (
    action: () => Promise<
      { success: true; cart: CartView } | { success: false; error: string }
    >
  ) => {
    setError(undefined)
    startTransition(async () => {
      const result = await action()
      if (!result.success) return setError(result.error)
      setCart(result.cart)
      router.refresh()
    })
  }

  const purchasable = cart.lines.filter((line) => line.purchasable)

  return (
    <PageContainer className="flex flex-col gap-xl py-xl">
      <header>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Carrinho
        </h1>
      </header>

      <p role="alert" className="text-body-sm text-destructive empty:hidden">
        {error}
      </p>

      {cart.lines.length === 0 ? (
        <div className="flex flex-col items-start gap-md rounded-lg bg-subtle p-lg">
          <p className="text-body text-ink-muted">Seu carrinho está vazio.</p>
          <div className="flex flex-wrap gap-sm">
            <Link href="/busca" className={buttonVariants()}>
              Explorar produtos
            </Link>
            {loggedIn && (
              <Link
                href="/conta/listas"
                className={buttonVariants({ variant: "ghost" })}
              >
                Retomar uma lista salva
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
          <section aria-label="Itens do carrinho" className="flex flex-col">
            <ul className="flex flex-col divide-y divide-line-subtle">
              {cart.lines.map((line) => (
                <CartLineRow
                  key={line.id}
                  line={line}
                  rules={rules}
                  pending={pending}
                  onSaved={(updated) => {
                    setCart(updated)
                    router.refresh()
                  }}
                  onQuantity={(quantity) =>
                    run(() => updateCartItem({ itemId: line.id, quantity }))
                  }
                  onRemove={() =>
                    run(() => removeCartItem({ itemId: line.id }))
                  }
                />
              ))}
            </ul>
          </section>

          <aside className="flex flex-col gap-lg">
            <OrderSummary
              subtotal={cart.subtotal}
              services={cart.servicesTotal}
              discount={discount}
              total={total}
              note={
                cart.extraBusinessDays > 0
                  ? `Personalização e serviços acrescentam ${cart.extraBusinessDays} ${cart.extraBusinessDays === 1 ? "dia útil" : "dias úteis"} ao prazo de entrega.`
                  : undefined
              }
            />
            {promotions &&
              (promotions.applied.length > 0 || promotions.couponCode) && (
                <PromotionsNote promotions={promotions} />
              )}
            {purchasable.length > 0 && promotions && (
              <CouponForm
                couponCode={promotions.couponCode}
                onChanged={() => router.refresh()}
              />
            )}
            {purchasable.length > 0 && (
              <ShippingEstimate
                key={`${purchasable
                  .map((line) => `${line.skuCode}:${line.quantity}`)
                  .join(",")}|${total}`}
                items={purchasable.map((line) => ({
                  skuCode: line.skuCode,
                  quantity: line.quantity,
                }))}
                quoteAction={({ cep }) => quoteCartShipping({ cep })}
              />
            )}
            {purchasable.length > 0 &&
              purchasable.length === cart.lines.length && (
                <Link
                  href={loggedIn ? "/checkout" : "/entrar?redirect=%2Fcheckout"}
                  className={buttonVariants()}
                >
                  Finalizar compra
                </Link>
              )}
            {purchasable.length > 0 && (
              <Link
                href={
                  loggedIn
                    ? "/cotacao/nova?origem=carrinho"
                    : `/entrar?redirect=${encodeURIComponent("/cotacao/nova?origem=carrinho")}`
                }
                className={buttonVariants({ variant: "ghost" })}
              >
                Solicitar cotação do carrinho
              </Link>
            )}
            {purchasable.length > 0 &&
              purchasable.length < cart.lines.length && (
                <p className="text-body-sm text-ink-muted">
                  Remova os itens indisponíveis para finalizar a compra.
                </p>
              )}
            {loggedIn ? (
              <SaveProjectListForm />
            ) : (
              <p className="text-body-sm text-ink-muted">
                <Link
                  href="/entrar?redirect=%2Fcarrinho"
                  className="text-primary underline"
                >
                  Entre na sua conta
                </Link>{" "}
                para manter o carrinho em qualquer dispositivo e salvá-lo como
                lista de projeto.
              </p>
            )}
          </aside>
        </div>
      )}
    </PageContainer>
  )
}

type CartLineRowProps = {
  line: CartLine
  rules: CartExtrasRules
  pending: boolean
  onSaved: (cart: CartView) => void
  onQuantity: (quantity: number) => void
  onRemove: () => void
}

/**
 * One cart line with the quantity stepper, the remove button and the
 * personalization and services of the line.
 *
 * @param props - Line and handlers.
 * @returns The list item.
 */
function CartLineRow({
  line,
  rules,
  pending,
  onSaved,
  onQuantity,
  onRemove,
}: CartLineRowProps) {
  const label = `${line.productName}, ${line.skuName}`
  return (
    <li className="flex flex-wrap gap-md py-md">
      <div className="size-20 shrink-0 overflow-hidden rounded bg-subtle">
        {line.imageKey && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/media/${line.imageKey}-320.webp`}
            alt=""
            className="h-full w-full object-cover"
          />
        )}
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-xs text-body-sm">
        <Link
          href={`/produto/${line.productSlug}`}
          className="text-body text-ink hover:underline"
        >
          {line.productName}
        </Link>
        <span className="text-ink-muted">
          {line.skuName} · {brl.format(Number(line.unitPrice))} cada
        </span>
        {!line.purchasable && (
          <span className="text-destructive">
            Indisponível no momento: não entra no total.
          </span>
        )}
        {line.purchasable && line.personalization && (
          <span className="text-ink">
            Gravação: “{line.personalization.text}” ·{" "}
            {brl.format(Number(line.engravingTotal))}
          </span>
        )}
        {line.purchasable &&
          line.services.map((service) => (
            <span key={service.key} className="text-ink">
              {service.label} ·{" "}
              {service.courtesy
                ? "Cortesia"
                : brl.format(Number(service.total))}
            </span>
          ))}
        <div className="mt-xs flex items-center gap-xs">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Diminuir quantidade de ${label}`}
            disabled={pending || line.quantity <= 1}
            onClick={() => onQuantity(line.quantity - 1)}
          >
            <MinusIcon />
          </Button>
          <span
            aria-live="polite"
            aria-label={`Quantidade: ${line.quantity}`}
            className="min-w-8 text-center text-body"
          >
            {line.quantity}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Aumentar quantidade de ${label}`}
            disabled={pending || line.quantity >= MAX_LINE_QUANTITY}
            onClick={() => onQuantity(line.quantity + 1)}
          >
            <PlusIcon />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="ml-sm border-transparent"
            aria-label={`Remover ${label} do carrinho`}
            disabled={pending}
            onClick={onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
        <CartLineExtras line={line} rules={rules} onSaved={onSaved} />
      </div>
      <strong className="text-body text-ink">
        {brl.format(Number(line.total))}
      </strong>
    </li>
  )
}

/**
 * Saves the cart as a named project list (RF07).
 *
 * @returns The form.
 */
function SaveProjectListForm() {
  const id = useId()
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<SaveProjectListInput>({
    resolver: zodResolver(saveProjectListSchema),
    defaultValues: { name: "" },
  })
  const fieldError = form.formState.errors.name?.message ?? error

  const onSubmit = form.handleSubmit((values) => {
    setMessage(undefined)
    setError(undefined)
    startTransition(async () => {
      const result = await saveCartAsProjectList(values)
      if (!result.success) return setError(result.error)
      form.reset()
      setMessage("Lista salva. Retome-a quando quiser em Minha conta.")
    })
  })

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-sm border-t border-line-subtle pt-md"
    >
      <h2 id={`${id}-title`} className="text-label">
        Salvar como lista de projeto
      </h2>
      <FormField id={`${id}-name`} label="Nome da lista" error={fieldError}>
        <Input
          id={`${id}-name`}
          placeholder="Ex.: Sala de reuniões — 3º andar"
          {...form.register("name")}
          {...fieldAria(`${id}-name`, fieldError)}
        />
      </FormField>
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Salvando…" : "Salvar lista"}
      </Button>
      <p role="status" className="text-body-sm text-ink empty:hidden">
        {message && (
          <>
            {message}{" "}
            <Link href="/conta/listas" className="text-primary underline">
              Ver listas
            </Link>
          </>
        )}
      </p>
    </form>
  )
}

/**
 * Coupon of the cart (RF46): applies a code or removes the one kept.
 *
 * @param props - Coupon kept on the cart and the refresh handler.
 * @returns The form.
 */
function CouponForm({
  couponCode,
  onChanged,
}: {
  couponCode: string | null
  onChanged: () => void
}) {
  const id = useId()
  const [error, setError] = useState<string>()
  const [message, setMessage] = useState<string>()
  const [pending, startTransition] = useTransition()
  const form = useForm<ApplyCouponInput>({
    resolver: zodResolver(applyCouponSchema),
    defaultValues: { code: "" },
  })
  const fieldError = form.formState.errors.code?.message ?? error

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined)
    setMessage(undefined)
    startTransition(async () => {
      const result = await applyCartCoupon(values)
      if (!result.success) return setError(result.error)
      form.reset()
      setMessage("Cupom aplicado.")
      onChanged()
    })
  })

  const remove = () => {
    setError(undefined)
    setMessage(undefined)
    startTransition(async () => {
      const result = await removeCartCoupon()
      if (!result.success) return setError(result.error)
      setMessage("Cupom removido.")
      onChanged()
    })
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-sm border-t border-line-subtle pt-md"
    >
      <h2 id={`${id}-title`} className="text-label">
        Cupom de desconto
      </h2>
      {couponCode ? (
        <div className="flex flex-wrap items-center justify-between gap-sm text-body-sm">
          <span>
            Cupom <strong>{couponCode}</strong>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={remove}
          >
            Remover cupom
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-sm">
          <FormField
            id={`${id}-code`}
            label="Código do cupom"
            error={fieldError}
            className="min-w-40 flex-1"
          >
            <Input
              id={`${id}-code`}
              autoComplete="off"
              {...form.register("code")}
              {...fieldAria(`${id}-code`, fieldError)}
            />
          </FormField>
          <Button type="submit" variant="ghost" disabled={pending}>
            {pending ? "Aplicando…" : "Aplicar"}
          </Button>
        </div>
      )}
      {couponCode && error && (
        <p role="alert" className="text-body-sm text-error">
          {error}
        </p>
      )}
      <p role="status" className="text-body-sm text-ink empty:hidden">
        {message}
      </p>
    </form>
  )
}
