import Image from "next/image"
import { cn } from "@/lib/utils"

type BrandLogoProps = {
  /**
   * `horizontal`: AB monogram beside the wordmark (header, menus).
   * `full`: the official stacked lockup with the tagline (footer).
   */
  variant?: "horizontal" | "full"
  /** `compact` keeps the horizontal logo small on every breakpoint. */
  size?: "default" | "compact"
  /** Extra classes for the wrapper. */
  className?: string
}

/**
 * Atelier Bureau logo (#14). The horizontal version pairs the AB
 * monogram with the serif wordmark so it stays legible at 24 px of
 * height; the full version is the approved stacked lockup.
 *
 * @param props - Variant, size and extra classes.
 * @returns The logo, with the brand name as accessible text.
 */
export function BrandLogo({
  variant = "horizontal",
  size = "default",
  className,
}: BrandLogoProps) {
  if (variant === "full") {
    return (
      <Image
        src="/brand/atelier-bureau-logo.png"
        alt="Atelier Bureau — Papelaria Premium"
        width={640}
        height={506}
        className={cn("h-auto w-40", className)}
      />
    )
  }

  return (
    <span className={cn("inline-flex items-center gap-xs", className)}>
      <Image
        src="/brand/atelier-bureau-monogram.png"
        alt=""
        width={177}
        height={160}
        priority
        className={cn("h-8 w-auto", size === "default" && "lg:h-10")}
      />
      <span
        className={cn(
          "font-serif text-headline-sm text-ink",
          size === "default" && "lg:text-headline-md"
        )}
      >
        Atelier Bureau
      </span>
    </span>
  )
}
