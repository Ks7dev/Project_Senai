"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cn } from "@/lib/utils"

/**
 * Filter chip from the design system. Uses a toggle button so screen
 * readers announce the pressed state; selected chips turn sage.
 *
 * @param props - Base UI toggle props (`pressed`, `onPressedChange`, ...).
 * @returns The rendered chip.
 */
function Chip({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      data-slot="chip"
      className={cn(
        "inline-flex h-9 items-center gap-xs rounded-full border border-line-subtle bg-subtle px-md text-label-sm font-medium text-ink transition-colors outline-none hover:border-line-strong focus-visible:ring-3 focus-visible:ring-focus disabled:pointer-events-none disabled:text-ink-disabled data-pressed:border-primary data-pressed:bg-primary-tint data-pressed:text-primary [&_svg]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

export { Chip }
