"use client"

import { useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { ScaleIcon, XIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import {
  clearCompare,
  getCompareServerSnapshot,
  getCompareSnapshot,
  MAX_COMPARE,
  subscribeCompare,
  toggleCompare,
} from "@/features/shared/lib/compare/compare-store"
import { cn } from "@/lib/utils"

/**
 * Hook with the current comparison.
 *
 * @returns Items chosen for comparison.
 */
function useCompare() {
  return useSyncExternalStore(
    subscribeCompare,
    getCompareSnapshot,
    getCompareServerSnapshot
  )
}

/**
 * "Comparar" toggle used on product cards and on the product page
 * (RF04). Shows a notice instead of adding a fifth product.
 *
 * @param props - Product slug and name.
 * @returns The toggle and its notice.
 */
export function CompareButton({ slug, name }: { slug: string; name: string }) {
  const items = useCompare()
  const [notice, setNotice] = useState<string>()
  const active = items.some((item) => item.slug === slug)
  return (
    <div className="flex flex-col items-end gap-xs">
      <button
        type="button"
        aria-pressed={active}
        onClick={() => {
          const result = toggleCompare({ slug, name })
          setNotice(
            result === "limit"
              ? `Você pode comparar até ${MAX_COMPARE} produtos. Remova um para incluir este.`
              : undefined
          )
        }}
        className={cn(
          "inline-flex h-9 items-center gap-xs rounded-full border px-sm text-label-sm transition-colors focus-visible:ring-3 focus-visible:ring-focus",
          active
            ? "border-primary bg-primary-tint text-primary"
            : "border-line-subtle bg-canvas/90 text-ink"
        )}
      >
        <ScaleIcon aria-hidden className="size-4" />
        {active ? "Comparando" : "Comparar"}
      </button>
      {notice && (
        <p
          role="alert"
          className="max-w-56 text-right text-body-sm text-warning"
        >
          {notice}
        </p>
      )}
    </div>
  )
}

/**
 * Floating bar with the products chosen for comparison, kept across
 * pages (RF04).
 *
 * @returns The bar, or nothing when the comparison is empty.
 */
export function CompareBar() {
  const items = useCompare()
  if (items.length === 0) return null
  const href = `/comparar?p=${items.map((item) => item.slug).join(",")}`
  return (
    <aside
      aria-label="Comparação de produtos"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line-subtle bg-elevated/95 shadow-2 backdrop-blur"
    >
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-sm px-margin-mobile py-sm md:px-margin-tablet lg:px-margin">
        <span className="text-label font-medium">
          Comparar ({items.length}/{MAX_COMPARE}):
        </span>
        <ul className="flex flex-1 flex-wrap gap-xs">
          {items.map((item) => (
            <li key={item.slug}>
              <button
                type="button"
                onClick={() => toggleCompare(item)}
                aria-label={`Remover ${item.name} da comparação`}
                className="inline-flex items-center gap-xs rounded-full bg-subtle px-sm py-1 text-label-sm"
              >
                {item.name}
                <XIcon aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={clearCompare}
          className="text-body-sm text-ink-muted underline"
        >
          Limpar
        </button>
        <Link
          href={href}
          className={buttonVariants({ size: "sm" })}
          aria-disabled={items.length < 2}
        >
          Ver comparação
        </Link>
      </div>
    </aside>
  )
}
