import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

/**
 * Text input with the design system states: focus halo in sage,
 * error through `aria-invalid` and muted disabled state.
 *
 * @param props - Native input props.
 * @returns The rendered input.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-11 w-full min-w-0 rounded border border-line bg-canvas px-md py-3 text-body text-ink transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-label file:font-medium file:text-ink placeholder:text-ink-muted focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-disabled aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className
      )}
      {...props}
    />
  )
}

export { Input }
