import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { purchasableSkuWhere } from "@/features/shared/lib/cart/cart-store"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { loadQuoteValidityDays } from "@/features/shared/lib/quotes/quote-expiration"
import {
  catalogUnitPrice,
  quoteTotals,
} from "@/features/shared/lib/quotes/quote-pricing"
import {
  isQuoteExpired,
  QUOTE_EXPIRED_MESSAGE,
  QUOTE_STILL_VALID_MESSAGE,
  quoteValidUntil,
  type QuoteValidity,
} from "@/features/shared/lib/quotes/quote-validity"

/** Message when a line of an expired quote left the catalog. */
export const QUOTE_LINE_UNAVAILABLE_MESSAGE =
  "Há itens desta cotação que não estão mais disponíveis. Solicite uma nova cotação."

/** What the revalidation changed. */
export type RevalidatedQuote = {
  /** New total at the current catalog prices, decimal string. */
  total: string
  /** New end of the validity. */
  validUntil: Date
  /** How many lines had their price changed. */
  changedLines: number
}

/**
 * Locks a quote row for the transaction (justified raw query: Prisma
 * has no row lock), so two revalidations, or a revalidation and the
 * conversion into an order, never run over the same quote.
 *
 * @param tx - Prisma transaction.
 * @param quoteId - Quote id.
 */
export async function lockQuote(
  tx: Prisma.TransactionClient,
  quoteId: string
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM quotes WHERE id = ${quoteId} FOR UPDATE`
}

/**
 * Refuses an action that depends on the prices of a quote past its
 * validity (RN02): the prices must be revalidated first.
 *
 * @param quote - Status and end of the validity.
 * @param now - Reference time.
 * @throws AppError("quote_expired").
 */
export function assertQuotePricesValid(quote: QuoteValidity, now: Date): void {
  if (isQuoteExpired(quote, now)) {
    throw new AppError(QUOTE_EXPIRED_MESSAGE, "quote_expired")
  }
}

/**
 * Revalidates the prices of an expired quote (RN02) inside a
 * transaction: every line gets the current catalog price again, the
 * discount and the shipping negotiated before stop holding, the
 * validity restarts and the quote returns to the sales queue as
 * requested. The audit log keeps the old and the new values (RNF12).
 * The caller has already checked who may act on the quote.
 *
 * @param tx - Prisma transaction.
 * @param input - Quote id, acting user (from the session) and time.
 * @returns The new total and validity.
 * @throws AppError when the quote is still valid or a line left the catalog.
 */
export async function revalidateExpiredQuote(
  tx: Prisma.TransactionClient,
  input: { quoteId: string; userId: string; now: Date }
): Promise<RevalidatedQuote> {
  const { quoteId, userId, now } = input
  await lockQuote(tx, quoteId)
  const quote = await tx.quote.findUniqueOrThrow({
    where: { id: quoteId },
    select: {
      status: true,
      validUntil: true,
      subtotal: true,
      discount: true,
      shippingTotal: true,
      total: true,
      items: {
        select: { id: true, skuId: true, quantity: true, unitPrice: true },
      },
    },
  })
  if (!isQuoteExpired(quote, now)) {
    throw new AppError(QUOTE_STILL_VALID_MESSAGE, "quote_still_valid")
  }
  const skuIds = quote.items.flatMap((item) => item.skuId ?? [])
  const skus = await tx.sku.findMany({
    where: { ...purchasableSkuWhere(), id: { in: skuIds } },
    select: {
      id: true,
      price: true,
      product: { select: { basePrice: true } },
    },
  })
  const prices = new Map(skus.map((sku) => [sku.id, catalogUnitPrice(sku)]))
  const lines = quote.items.map((item) => {
    const unitPrice = item.skuId ? prices.get(item.skuId) : undefined
    if (!unitPrice) {
      throw new AppError(QUOTE_LINE_UNAVAILABLE_MESSAGE, "unavailable_line")
    }
    return {
      id: item.id,
      quantity: item.quantity,
      unitPrice,
      changed: item.unitPrice?.toFixed(2) !== unitPrice,
    }
  })
  const changed = lines.filter((line) => line.changed)
  for (const line of changed) {
    await tx.quoteItem.update({
      where: { id: line.id },
      data: { unitPrice: line.unitPrice },
    })
  }
  const totals = quoteTotals(lines)
  const validUntil = quoteValidUntil(now, await loadQuoteValidityDays(tx))
  await tx.quote.update({
    where: { id: quoteId },
    data: {
      status: "REQUESTED",
      subtotal: totals.subtotal,
      discount: totals.discount,
      shippingTotal: totals.shippingTotal,
      total: totals.total,
      validUntil,
    },
  })
  await writeAudit(tx, {
    userId,
    action: "quote.revalidate",
    entity: "quote",
    entityId: quoteId,
    before: {
      status: quote.status,
      validUntil: quote.validUntil,
      subtotal: quote.subtotal,
      discount: quote.discount,
      shippingTotal: quote.shippingTotal,
      total: quote.total,
    },
    after: {
      status: "REQUESTED",
      validUntil,
      total: totals.total,
      changedLines: changed.length,
    },
  })
  return { total: totals.total, validUntil, changedLines: changed.length }
}
