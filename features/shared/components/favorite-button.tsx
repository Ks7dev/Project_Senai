"use client"

import { useSyncExternalStore, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { HeartIcon } from "lucide-react"
import {
  listMyFavoriteIds,
  setFavorite,
} from "@/features/shared/lib/favorites/favorite-actions"
import { cn } from "@/lib/utils"

let favorites: Set<string> | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()
const EMPTY = new Set<string>()

/**
 * Loads the user's favorites once per page and notifies every button.
 */
function load() {
  if (loading) return
  loading = listMyFavoriteIds().then((result) => {
    favorites = new Set(result.success ? result.productIds : [])
    listeners.forEach((listener) => listener())
  })
}

/**
 * Subscribes a button to favorite changes.
 *
 * @param listener - Re-render callback.
 * @returns Unsubscribe function.
 */
function subscribe(listener: () => void) {
  listeners.add(listener)
  load()
  return () => listeners.delete(listener)
}

/**
 * Updates the shared favorites set.
 *
 * @param productId - Product id.
 * @param favorite - New state.
 */
function update(productId: string, favorite: boolean) {
  favorites = new Set(favorites ?? [])
  if (favorite) favorites.add(productId)
  else favorites.delete(productId)
  listeners.forEach((listener) => listener())
}

type FavoriteButtonProps = {
  /** Product id. */
  productId: string
  /** Product name, for the accessible label. */
  productName: string
  /** Visual size. */
  size?: "sm" | "md"
}

/**
 * Heart toggle that adds or removes a product from the favorites (RF45),
 * used on product cards and on the product page. Visitors are sent to
 * the login and come back to the same page.
 *
 * @param props - Product and size.
 * @returns The toggle button.
 */
export function FavoriteButton({
  productId,
  productName,
  size = "md",
}: FavoriteButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const set = useSyncExternalStore(
    subscribe,
    () => favorites ?? EMPTY,
    () => EMPTY
  )
  const active = set.has(productId)

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={
        active
          ? `Remover ${productName} dos favoritos`
          : `Adicionar ${productName} aos favoritos`
      }
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          update(productId, !active)
          const result = await setFavorite({ productId, favorite: !active })
          if (!result.success) {
            update(productId, active)
            if (result.error.startsWith("Entre na sua conta")) {
              router.push(`/entrar?redirect=${encodeURIComponent(pathname)}`)
            }
          }
        })
      }
      className={cn(
        "flex items-center justify-center rounded-full border border-line-subtle bg-canvas/90 text-ink transition-colors hover:text-clay focus-visible:ring-3 focus-visible:ring-focus",
        size === "sm" ? "size-9" : "size-11"
      )}
    >
      <HeartIcon
        aria-hidden
        className={cn("size-4", active && "fill-clay text-clay")}
      />
    </button>
  )
}
