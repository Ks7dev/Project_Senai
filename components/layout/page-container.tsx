import { cn } from "@/lib/utils"

/**
 * Page width container: max 1440px with the editorial side margins of
 * each breakpoint (RNF15).
 *
 * @param props - Div props.
 * @returns The container.
 */
export function PageContainer({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-page px-margin-mobile md:px-margin-tablet lg:px-margin",
        className
      )}
      {...props}
    />
  )
}

/**
 * Responsive layout grid: 4 columns on mobile, 8 on tablet and 12 on
 * desktop, with the design system gutters (RNF15).
 *
 * @param props - Div props.
 * @returns The grid.
 */
export function PageGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "grid grid-cols-4 gap-gutter-mobile md:grid-cols-8 md:gap-gutter-tablet lg:grid-cols-12 lg:gap-gutter",
        className
      )}
      {...props}
    />
  )
}
