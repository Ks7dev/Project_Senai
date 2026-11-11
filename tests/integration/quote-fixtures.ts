import type { PrismaClient } from "@/generated/prisma/client"
import { orderFixtures } from "./order-fixtures"

/** Fixture builders for the quote integration tests. */
export type QuoteFixtures = ReturnType<typeof quoteFixtures>

/** First bytes of a minimal PDF, enough for the signature check. */
export const PDF_BYTES = Buffer.from("%PDF-1.7\n%fictício\n%%EOF\n")

/**
 * Creates fixtures bound to a Prisma client: published test products
 * with their own SKU and stock, request form data and the cleanup of
 * every quote, order and e-mail created by the test.
 *
 * @param prisma - Prisma client of the test.
 * @returns Builders and the cleanup.
 */
export function quoteFixtures(prisma: PrismaClient) {
  const orders = orderFixtures(prisma)

  return {
    orders,

    /**
     * Creates a published product with one SKU (price R$ 100,00).
     *
     * @param onHand - Units on hand.
     * @returns The SKU id, code and product slug.
     */
    async createProduct(onHand = 10) {
      const sku = await orders.createSku(onHand)
      const row = await prisma.sku.update({
        where: { id: sku.id },
        data: { product: { update: { status: "ACTIVE" } } },
        select: { product: { select: { slug: true } } },
      })
      return { ...sku, slug: row.product.slug }
    },

    /**
     * Builds the form data of a quote request.
     *
     * @param input - Lines, notes and files.
     * @returns The form data.
     */
    requestForm(input: {
      lines: Array<{ skuId: string; quantity: number }>
      notes?: string
      files?: File[]
    }) {
      const data = new FormData()
      data.set(
        "payload",
        JSON.stringify({ lines: input.lines, notes: input.notes ?? "" })
      )
      for (const file of input.files ?? []) data.append("attachments", file)
      return data
    },

    /**
     * Deletes the quotes of the test products (and their orders and
     * e-mails), then the products.
     */
    async cleanup() {
      const quotes = await prisma.quote.findMany({
        where: {
          items: {
            some: { product: { slug: { startsWith: "teste-estoque-" } } },
          },
        },
        select: { id: true, number: true },
      })
      if (quotes.length > 0) {
        const quoteIds = quotes.map((quote) => quote.id)
        const converted = await prisma.order.findMany({
          where: { quoteId: { in: quoteIds } },
          select: { id: true, number: true },
        })
        await prisma.emailOutbox.deleteMany({
          where: {
            OR: [...quotes, ...converted].map(({ number }) => ({
              subject: { contains: number },
            })),
          },
        })
        const orderIds = converted.map((order) => order.id)
        await prisma.stockMovement.deleteMany({
          where: { orderId: { in: orderIds } },
        })
        await prisma.payment.deleteMany({
          where: { orderId: { in: orderIds } },
        })
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
        await prisma.quote.deleteMany({ where: { id: { in: quoteIds } } })
      }
      await orders.cleanup()
    },
  }
}
