import { randomUUID } from "node:crypto"
import type { PrismaClient } from "@/generated/prisma/client"

/** Fixture builders for the order, stock and e-mail integration tests. */
export type OrderFixtures = ReturnType<typeof orderFixtures>

/**
 * Creates fixtures bound to a Prisma client: a draft test product with
 * its own SKU and stock (so seed data is never touched) and orders of
 * the seed customers. `cleanup` removes everything it created.
 *
 * @param prisma - Prisma client of the test.
 * @returns Builders and the cleanup.
 */
export function orderFixtures(prisma: PrismaClient) {
  const orders: string[] = []
  const numbers: string[] = []
  const products: string[] = []
  let sequence = 0

  return {
    /**
     * Creates a draft product with one SKU and the given stock.
     *
     * @param onHand - Units on hand.
     * @returns The SKU id and code.
     */
    async createSku(onHand: number) {
      const category = await prisma.category.findFirstOrThrow({
        select: { id: true },
      })
      const tag = randomUUID().slice(0, 8)
      const product = await prisma.product.create({
        data: {
          categoryId: category.id,
          slug: `teste-estoque-${tag}`,
          name: `Produto de teste ${tag}`,
          description: "Produto fictício criado pelo teste de integração.",
          basePrice: "100.00",
          weightKg: "1.000",
          lengthCm: "10.00",
          widthCm: "10.00",
          heightCm: "10.00",
          skus: {
            create: {
              code: `TST-${tag}`,
              name: "Único",
              stock: { create: { onHand } },
            },
          },
        },
        select: { id: true, skus: { select: { id: true, code: true } } },
      })
      products.push(product.id)
      return product.skus[0]
    },

    /**
     * Creates an order of a seed customer with one line of the SKU.
     *
     * @param input - Customer e-mail, SKU, quantity, status and method.
     * @returns The order id, number and customer id.
     */
    async createOrder(input: {
      email: string
      sku: { id: string; code: string }
      quantity?: number
      status?:
        | "AWAITING_PAYMENT"
        | "AWAITING_APPROVAL"
        | "AWAITING_SHIPPING_QUOTE"
        | "PAID"
      paymentMethod?: "PIX" | "BOLETO" | "CARD" | "INVOICED"
      organizationSlug?: string
    }) {
      const user = await prisma.user.findUniqueOrThrow({
        where: { email: input.email },
        select: { id: true },
      })
      const organization = input.organizationSlug
        ? await prisma.organization.findUniqueOrThrow({
            where: { slug: input.organizationSlug },
            select: { id: true },
          })
        : null
      const quantity = input.quantity ?? 1
      sequence += 1
      const order = await prisma.order.create({
        data: {
          number: `AB-T${Date.now().toString().slice(-8)}${sequence}`,
          userId: user.id,
          organizationId: organization?.id ?? null,
          status: input.status ?? "AWAITING_PAYMENT",
          paymentMethod: input.paymentMethod ?? "PIX",
          subtotal: (100 * quantity).toFixed(2),
          total: (100 * quantity).toFixed(2),
          shippingAddress: { cep: "01310100", city: "São Paulo", state: "SP" },
          items: {
            create: {
              skuId: input.sku.id,
              productName: "Produto de teste",
              skuCode: input.sku.code,
              quantity,
              unitPrice: "100.00",
              total: (100 * quantity).toFixed(2),
            },
          },
        },
        select: { id: true, number: true, userId: true },
      })
      orders.push(order.id)
      numbers.push(order.number)
      return order
    },

    /**
     * Reads the stock counters of a SKU.
     *
     * @param skuId - SKU id.
     * @returns On hand and reserved units.
     */
    async counters(skuId: string) {
      return prisma.stock.findUniqueOrThrow({
        where: { skuId },
        select: { onHand: true, reserved: true },
      })
    },

    /**
     * Deletes the orders, payments, queued order e-mails and products
     * created by the test.
     */
    async cleanup() {
      if (numbers.length > 0) {
        await prisma.emailOutbox.deleteMany({
          where: {
            OR: numbers.map((number) => ({ subject: { contains: number } })),
          },
        })
      }
      await prisma.payment.deleteMany({ where: { orderId: { in: orders } } })
      await prisma.order.deleteMany({ where: { id: { in: orders } } })
      await prisma.product.deleteMany({ where: { id: { in: products } } })
    },
  }
}
