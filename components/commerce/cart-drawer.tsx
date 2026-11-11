"use client"

import Link from "next/link"
import { ShoppingBagIcon } from "lucide-react"
import { OrderSummary } from "@/components/commerce/order-summary"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

/** A line of the cart drawer. */
export type CartDrawerItem = {
  /** SKU code. */
  sku: string
  /** Product name. */
  name: string
  /** Variation name. */
  variant: string
  /** Quantity. */
  quantity: number
  /** Line total as a decimal string. */
  total: string
  /** Storage key of the product image. */
  imageKey?: string | null
}

type CartDrawerProps = {
  /** Cart lines. */
  items: CartDrawerItem[]
  /** Sum of the items. */
  subtotal: string
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Cart drawer opened from the header (#16): items with quiet
 * subtotals, order summary and the way to the cart. Slides from the
 * right, traps focus and closes with Esc.
 *
 * @param props - Cart lines and subtotal.
 * @returns The trigger and the drawer.
 */
export function CartDrawer({ items, subtotal }: CartDrawerProps) {
  const count = items.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative border-transparent"
            aria-label={`Abrir carrinho, ${count} ${count === 1 ? "item" : "itens"}`}
          />
        }
      >
        <ShoppingBagIcon className="size-5" />
        {count > 0 && (
          <span
            aria-hidden
            className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-label-sm text-primary-foreground"
          >
            {count}
          </span>
        )}
      </SheetTrigger>
      <SheetContent
        side="right"
        className="flex w-full flex-col bg-canvas sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle className="font-serif text-headline-sm">
            Carrinho
          </SheetTitle>
          <SheetDescription>
            {count === 0
              ? "Seu carrinho está vazio."
              : `${count} ${count === 1 ? "item" : "itens"}`}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-1 flex-col gap-md overflow-y-auto px-md">
          {items.map((item) => (
            <li key={item.sku} className="flex gap-sm">
              <div className="size-16 shrink-0 overflow-hidden rounded bg-subtle">
                {item.imageKey && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/media/${item.imageKey}-320.webp`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
              <div className="flex flex-1 flex-col text-body-sm">
                <span className="text-ink">{item.name}</span>
                <span className="text-ink-muted">
                  {item.variant} · {item.quantity} un.
                </span>
              </div>
              <span className="text-body-sm text-ink">
                {brl.format(Number(item.total))}
              </span>
            </li>
          ))}
        </ul>
        {count > 0 && (
          <div className="flex flex-col gap-sm p-md">
            <OrderSummary subtotal={subtotal} total={subtotal} />
            <SheetClose
              nativeButton={false}
              render={
                <Link
                  href="/carrinho"
                  className={buttonVariants({ size: "lg" })}
                />
              }
            >
              Ver carrinho e finalizar
            </SheetClose>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
