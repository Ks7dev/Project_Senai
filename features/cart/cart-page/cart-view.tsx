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
  removeCartItem,
  saveCartAsProjectList,
  updateCartItem,
} from "@/features/cart/cart-page/action/cart-page-actions"
import {
  saveProjectListSchema,
  type SaveProjectListInput,
} from "@/features/cart/cart-page/schema/cart-page-schema"
import { ShippingEstimate } from "@/features/shared/components/shipping-estimate"
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
}

/**
 * Cart page (#46, RF07): lines with quantity and removal, order
 * summary, shipping estimate by CEP and the option to save the cart as
 * a project list to resume later.
 *
 * @param props - Cart and login state.
 * @returns The page content.
 */
export function CartPageView({
  cart: initialCart,
  loggedIn,
}: CartPageViewProps) {
  const router = useRouter()
  const [cart, setCart] = useState(initialCart)
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
                  pending={pending}
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
            <OrderSummary subtotal={cart.subtotal} total={cart.subtotal} />
            {purchasable.length > 0 && (
              <ShippingEstimate
                key={purchasable
                  .map((line) => `${line.skuCode}:${line.quantity}`)
                  .join(",")}
                items={purchasable.map((line) => ({
                  skuCode: line.skuCode,
                  quantity: line.quantity,
                }))}
              />
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
  pending: boolean
  onQuantity: (quantity: number) => void
  onRemove: () => void
}

/**
 * One cart line with the quantity stepper and the remove button.
 *
 * @param props - Line and handlers.
 * @returns The list item.
 */
function CartLineRow({
  line,
  pending,
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
