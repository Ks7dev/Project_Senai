import { Badge } from "@/components/ui/badge"
import {
  QUOTE_STATUS,
  type QuoteStatusKey,
} from "@/features/shared/lib/quotes/quote-status"

/**
 * Badge with the quote status, used by the customer area and the back
 * office (RF06, RF20).
 *
 * @param props - Quote status.
 * @returns The badge.
 */
export function QuoteStatusBadge({ status }: { status: QuoteStatusKey }) {
  const { label, tone } = QUOTE_STATUS[status]
  return (
    <Badge
      variant={
        tone === "problem"
          ? "destructive"
          : tone === "done"
            ? "default"
            : "outline"
      }
    >
      {label}
    </Badge>
  )
}
