import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Button styles from the Warm Editorial Atelier design system:
 * primary (solid sage), ghost (outline), editorial text action and
 * destructive. Every color comes from the design tokens.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-sm rounded border border-transparent bg-clip-padding text-label font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-focus disabled:pointer-events-none disabled:text-ink-disabled disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-none hover:bg-primary-hover hover:shadow-1",
        ghost:
          "border-line-strong bg-transparent text-ink hover:border-ink hover:bg-subtle aria-expanded:bg-subtle",
        editorial:
          "h-auto rounded-none border-0 px-0 font-serif text-body-lg text-ink underline decoration-1 underline-offset-4 hover:text-clay",
        destructive:
          "bg-destructive text-on-error hover:bg-destructive/90 focus-visible:ring-destructive/30",
        subtle:
          "bg-subtle text-ink hover:bg-primary-tint aria-expanded:bg-primary-tint",
      },
      size: {
        default: "h-11 px-lg",
        sm: "h-9 px-md text-label-sm",
        lg: "h-12 px-xl text-subhead",
        icon: "size-11",
        "icon-sm": "size-9",
      },
    },
    compoundVariants: [
      { variant: "editorial", size: "default", class: "h-auto px-0" },
      { variant: "editorial", size: "sm", class: "h-auto px-0 text-body" },
      { variant: "editorial", size: "lg", class: "h-auto px-0" },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Accessible button (Base UI) with the design system variants.
 *
 * @param props - Base UI button props plus `variant` and `size`.
 * @returns The rendered button.
 */
function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
