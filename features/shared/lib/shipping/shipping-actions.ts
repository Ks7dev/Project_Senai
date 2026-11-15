"use server"

import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import { quoteShippingForItems } from "@/features/shared/lib/shipping/shipping-service"
import type { ShippingQuote } from "@/features/shared/lib/shipping/strategies"
import {
  shippingQuoteSchema,
  type ShippingQuoteInput,
} from "@/features/shared/schema/shipping-schema"

/**
 * Calculates the shipping options for a CEP and order lines (RF25,
 * RN20). Public, like the product page, and rate limited per IP
 * because it calls the shipping APIs. Weight, dimensions and assembly
 * come from the database, never from the request.
 *
 * @param input - Destination CEP and lines by SKU code.
 * @returns `{ success: true, quote }` or `{ success: false, error }`.
 */
export async function quoteShipping(
  input: ShippingQuoteInput
): Promise<ActionResult<{ quote: ShippingQuote }>> {
  try {
    const parsed = shippingQuoteSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o CEP e os produtos.",
        "invalid"
      )
    }
    await enforceActionRateLimit("shipping", { limit: 30, windowMs: 60_000 })
    return { success: true, quote: await quoteShippingForItems(parsed.data) }
  } catch (error) {
    return toActionError(error, { action: "quoteShipping" })
  }
}
