import type { ReactNode } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"

/** Data shown by the product card. */
export type ProductCardProps = {
  /** URL slug. */
  slug: string
  /** Product name. */
  name: string
  /** Brand, if any. */
  brand: string | null
  /** Price as a decimal string. */
  price: string
  /** Storage key of the first image (without width suffix). */
  imageKey: string | null
  /** Alternative text of the image. */
  imageAlt: string
  /** Whether there is stock available now. */
  available: boolean
  /** Buttons over the image (favorite, compare), outside the link. */
  actions?: ReactNode
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Product card used in listings, search and favorites. Images come in
 * responsive WebP sizes (RNF04); products without stock show "Sob
 * encomenda" instead of hiding. Actions sit outside the link, so the
 * buttons are not nested inside it.
 *
 * @param props - Product summary.
 * @returns The card.
 */
export function ProductCard({
  slug,
  name,
  brand,
  price,
  imageKey,
  imageAlt,
  available,
  actions,
}: ProductCardProps) {
  return (
    <article className="group relative flex flex-col gap-sm">
      <Link
        href={`/produto/${slug}`}
        className="flex flex-col gap-sm rounded-lg transition-shadow hover:shadow-1"
      >
        <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-subtle">
          {imageKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/media/${imageKey}-640.webp`}
              srcSet={`/media/${imageKey}-320.webp 320w, /media/${imageKey}-640.webp 640w`}
              sizes="(min-width: 1200px) 25vw, (min-width: 768px) 33vw, 50vw"
              alt={imageAlt}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex h-full items-center justify-center text-caps text-ink-muted uppercase"
            >
              Atelier Bureau
            </div>
          )}
          {!available && (
            <Badge variant="secondary" className="absolute top-sm left-sm">
              Sob encomenda
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-xs px-xs pb-sm">
          {brand && <p className="text-caps text-clay uppercase">{brand}</p>}
          <h3 className="text-headline-sm text-ink">{name}</h3>
          <p className="text-label font-medium text-ink">
            {brl.format(Number(price))}
          </p>
        </div>
      </Link>
      {actions && (
        <div className="absolute top-sm right-sm flex flex-col items-end gap-xs">
          {actions}
        </div>
      )}
    </article>
  )
}
