import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { jar } from "./next-headers-stub"
import { orderFixtures } from "./order-fixtures"

try {
  process.loadEnvFile()
} catch {
  // Variables come from the environment (CI)
}

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  revalidatePath: vi.fn(),
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { reserveStock, writeOffOrderStock, releaseOrderStock } =
  await import("@/features/shared/lib/stock/stock-service")
const { expireUnpaidOrders } =
  await import("@/features/shared/lib/orders/order-expiration")
const { listStock, restockSkuAction, releaseExpiredReservations } =
  await import("@/features/orders/stock/action/stock-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"

/**
 * Logs in with a seed account through the real sign-in action.
 *
 * @param email - Seed account e-mail.
 */
async function login(email: string) {
  jar.clear()
  const result = await signIn({ email, password })
  expect(result).toEqual({ success: true, twoFactor: false })
}

/**
 * Reserves the order lines in a transaction of its own, like checkout.
 *
 * @param order - Order id and its lines.
 * @param allowBackorder - Whether missing units become made to order.
 * @returns The reservation plan.
 */
function reserve(
  order: { id: string; items: Array<{ skuId: string; quantity: number }> },
  allowBackorder = false
) {
  return prisma.$transaction((tx) =>
    reserveStock(tx, {
      orderId: order.id,
      items: order.items,
      userId: null,
      allowBackorder,
    })
  )
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("stock reservation (#64, RF43, RF44, RN14)", () => {
  it("never reserves the same unit for two simultaneous orders", async () => {
    const sku = await fixtures.createSku(1)
    const first = await fixtures.createOrder({ email: customer, sku })
    const second = await fixtures.createOrder({ email: customer, sku })

    const results = await Promise.allSettled([
      reserve({ id: first.id, items: [{ skuId: sku.id, quantity: 1 }] }),
      reserve({ id: second.id, items: [{ skuId: sku.id, quantity: 1 }] }),
    ])

    const fulfilled = results.filter((r) => r.status === "fulfilled")
    const rejected = results.filter((r) => r.status === "rejected")
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
      code: "out_of_stock",
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 1,
      reserved: 1,
    })
    expect(
      await prisma.stockMovement.count({
        where: { skuId: sku.id, type: "RESERVE" },
      })
    ).toBe(1)
  })

  it("splits ten concurrent orders over five units without overselling", async () => {
    const sku = await fixtures.createSku(5)
    const orders = await Promise.all(
      Array.from({ length: 10 }, () =>
        fixtures.createOrder({ email: customer, sku })
      )
    )
    const results = await Promise.allSettled(
      orders.map((order) =>
        reserve({ id: order.id, items: [{ skuId: sku.id, quantity: 1 }] })
      )
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5)
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 5,
      reserved: 5,
    })
  })

  it("discounts reservations from the available stock shown to buyers", async () => {
    const sku = await fixtures.createSku(3)
    const order = await fixtures.createOrder({
      email: customer,
      sku,
      quantity: 2,
    })
    await reserve({ id: order.id, items: [{ skuId: sku.id, quantity: 2 }] })

    await login("admin@atelierbureau.test")
    const listed = await listStock({ search: sku.code })
    expect(listed.success).toBe(true)
    if (!listed.success) return
    expect(listed.rows).toEqual([
      expect.objectContaining({
        skuId: sku.id,
        onHand: 3,
        reserved: 2,
        available: 1,
      }),
    ])
  })

  it("reports missing units as made to order when backorder is allowed", async () => {
    const sku = await fixtures.createSku(1)
    const order = await fixtures.createOrder({
      email: customer,
      sku,
      quantity: 3,
    })
    const plan = await reserve(
      { id: order.id, items: [{ skuId: sku.id, quantity: 3 }] },
      true
    )
    expect(plan).toEqual([
      { skuId: sku.id, requested: 3, reserved: 1, backordered: 2 },
    ])
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 1,
      reserved: 1,
    })
  })

  it("writes off on confirmation and releases on cancellation, only once", async () => {
    const sku = await fixtures.createSku(4)
    const paid = await fixtures.createOrder({
      email: customer,
      sku,
      quantity: 2,
    })
    const canceled = await fixtures.createOrder({ email: customer, sku })
    await reserve({ id: paid.id, items: [{ skuId: sku.id, quantity: 2 }] })
    await reserve({ id: canceled.id, items: [{ skuId: sku.id, quantity: 1 }] })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 4,
      reserved: 3,
    })

    for (let i = 0; i < 2; i++) {
      await prisma.$transaction((tx) =>
        writeOffOrderStock(tx, { orderId: paid.id, userId: null })
      )
      await prisma.$transaction((tx) =>
        releaseOrderStock(tx, {
          orderId: canceled.id,
          userId: null,
          note: "Pedido cancelado",
        })
      )
    }
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 2,
      reserved: 0,
    })
    expect(
      await prisma.stockMovement.count({
        where: { skuId: sku.id, type: { in: ["WRITE_OFF", "RELEASE"] } },
      })
    ).toBe(2)
  })

  it("cancels expired Pix orders and releases their reservation", async () => {
    const sku = await fixtures.createSku(2)
    const expired = await fixtures.createOrder({ email: customer, sku })
    const onTime = await fixtures.createOrder({ email: customer, sku })
    await reserve({ id: expired.id, items: [{ skuId: sku.id, quantity: 1 }] })
    await reserve({ id: onTime.id, items: [{ skuId: sku.id, quantity: 1 }] })
    const now = new Date()
    await prisma.payment.createMany({
      data: [
        {
          orderId: expired.id,
          method: "PIX",
          amount: "100.00",
          expiresAt: new Date(now.getTime() - 60_000),
        },
        {
          orderId: onTime.id,
          method: "PIX",
          amount: "100.00",
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
      ],
    })

    const canceled = await expireUnpaidOrders(now)
    expect(canceled).toContain(expired.id)
    expect(canceled).not.toContain(onTime.id)
    expect(await expireUnpaidOrders(now)).not.toContain(expired.id)

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: expired.id },
      select: {
        status: true,
        payments: { select: { status: true } },
        statusHistory: {
          select: { fromStatus: true, toStatus: true, changedById: true },
        },
      },
    })
    expect(stored).toEqual({
      status: "CANCELED",
      payments: [{ status: "EXPIRED" }],
      statusHistory: [
        {
          fromStatus: "AWAITING_PAYMENT",
          toStatus: "CANCELED",
          changedById: null,
        },
      ],
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 2,
      reserved: 1,
    })
  })
})

describe("manual restock (#64, RF43)", () => {
  it("records the restock with user, reason and audit log", async () => {
    const sku = await fixtures.createSku(0)
    await login("admin@atelierbureau.test")
    const result = await restockSkuAction({
      skuId: sku.id,
      quantity: "7",
      note: "NF 123 do fornecedor (fictícia)",
    })
    expect(result).toEqual({ success: true, available: 7 })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 7,
      reserved: 0,
    })
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@atelierbureau.test" },
      select: { id: true },
    })
    expect(
      await prisma.stockMovement.findFirst({
        where: { skuId: sku.id, type: "RESTOCK" },
        select: { quantity: true, userId: true, note: true },
      })
    ).toEqual({
      quantity: 7,
      userId: admin.id,
      note: "NF 123 do fornecedor (fictícia)",
    })
    expect(
      await prisma.auditLog.count({
        where: { action: "stock.restock", entityId: sku.id },
      })
    ).toBe(1)
  })

  it("validates the input and refuses users without stock permission", async () => {
    const sku = await fixtures.createSku(0)
    await login("admin@atelierbureau.test")
    expect(
      await restockSkuAction({ skuId: sku.id, quantity: "0", note: "Teste" })
    ).toEqual({
      success: false,
      error: "A quantidade deve ficar entre 1 e 100.000.",
    })

    await login("comercial@atelierbureau.test")
    expect(
      await restockSkuAction({ skuId: sku.id, quantity: "2", note: "Teste" })
    ).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(await releaseExpiredReservations()).toMatchObject({
      success: false,
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 0,
      reserved: 0,
    })
  })
})
