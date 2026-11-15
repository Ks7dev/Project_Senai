"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { addToCart } from "@/features/shared/lib/cart/cart-actions"

type AddToCartButtonProps = {
  /** SKU code of the chosen variation. */
  skuCode?: string
  /** Button text, e.g. "Comprar" or "Encomendar". */
  label: string
}

/**
 * Adds the chosen variation to the cart and opens the cart page (RF07).
 * Works for visitors and logged-in customers; errors are announced
 * next to the button.
 *
 * @param props - SKU code and label.
 * @returns The button.
 */
export function AddToCartButton({ skuCode, label }: AddToCartButtonProps) {
  const router = useRouter()
  const [error, setError] = useState<string>()
  const [pending, startTransition] = useTransition()

  const onClick = () => {
    if (!skuCode) return
    setError(undefined)
    startTransition(async () => {
      const result = await addToCart({ skuCode, quantity: 1 })
      if (!result.success) return setError(result.error)
      router.push("/carrinho")
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-xs">
      <Button
        type="button"
        size="lg"
        onClick={onClick}
        disabled={pending || !skuCode}
      >
        {pending ? "Adicionando…" : label}
      </Button>
      <p role="alert" className="text-body-sm text-destructive empty:hidden">
        {error}
      </p>
    </div>
  )
}
