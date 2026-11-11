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
const { reserveStock } =
  await import("@/features/shared/lib/stock/stock-service")
const { transitionOrder } =
  await import("@/features/shared/lib/orders/order-lifecycle")
const { listAdminOrders, updateOrderStatus } =
  await import("@/features/orders/order-management/action/order-management-actions")

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
 * Id of a seed user.
 *
 * @param email - Seed account e-mail.
 * @returns The user id.
 */
async function userId(email: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true },
  })
  return user.id
}

/**
 * Creates an order with one reserved unit of a fresh SKU.
 *
 * @param onHand - Units of the SKU.
 * @returns The order and the SKU.
 */
async function reservedOrder(onHand = 2) {
  const sku = await fixtures.createSku(onHand)
  const order = await fixtures.createOrder({ email: customer, sku })
  await prisma.$transaction((tx) =>
    reserveStock(tx, {
      orderId: order.id,
      items: [{ skuId: sku.id, quantity: 1 }],
      userId: order.userId,
    })
  )
  return { order, sku }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("order life cycle (#65, RF54)", () => {
  it("refuses invalid transitions and keeps the order untouched", async () => {
    const { order } = await reservedOrder()
    await expect(
      prisma.$transaction((tx) =>
        transitionOrder(tx, {
          orderId: order.id,
          to: "SHIPPED",
          changedById: null,
        })
      )
    ).rejects.toMatchObject({
      code: "invalid_transition",
      publicMessage:
        'O pedido está em "Aguardando pagamento" e não pode passar para "Em transporte".',
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, statusHistory: { select: { id: true } } },
    })
    expect(stored).toEqual({ status: "AWAITING_PAYMENT", statusHistory: [] })
  })

  it("records date and responsible user and writes off stock when paid", async () => {
    const { order, sku } = await reservedOrder(2)
    const now = new Date("2026-11-11T18:00:00.000Z")
    await prisma.$transaction((tx) =>
      transitionOrder(tx, {
        orderId: order.id,
        to: "PAID",
        changedById: null,
        note: "Pagamento aprovado (teste)",
        now,
      })
    )
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      select: {
        fromStatus: true,
        toStatus: true,
        changedById: true,
        createdAt: true,
        note: true,
      },
    })
    expect(history).toEqual([
      {
        fromStatus: "AWAITING_PAYMENT",
        toStatus: "PAID",
        changedById: null,
        createdAt: now,
        note: "Pagamento aprovado (teste)",
      },
    ])
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 1,
      reserved: 0,
    })
  })

  it("lets only one of two concurrent changes of the same order win", async () => {
    const { order } = await reservedOrder()
    await prisma.$transaction((tx) =>
      transitionOrder(tx, { orderId: order.id, to: "PAID", changedById: null })
    )
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        prisma.$transaction((tx) =>
          transitionOrder(tx, {
            orderId: order.id,
            to: "SEPARATING",
            changedById: null,
          })
        )
      )
    )
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, toStatus: "SEPARATING" },
      })
    ).toBe(1)
  })
})

describe("back office status change (#65)", () => {
  it("moves a paid order through fulfillment with the user on each step", async () => {
    const { order } = await reservedOrder()
    await prisma.$transaction((tx) =>
      transitionOrder(tx, { orderId: order.id, to: "PAID", changedById: null })
    )
    await login("admin@atelierbureau.test")
    const admin = await userId("admin@atelierbureau.test")

    for (const to of [
      "IN_PRODUCTION",
      "SEPARATING",
      "INVOICED",
      "SHIPPED",
      "DELIVERED",
      "INSTALLED",
    ] as const) {
      expect(await updateOrderStatus({ orderId: order.id, to })).toEqual({
        success: true,
        status: to,
      })
    }
    expect(
      await updateOrderStatus({ orderId: order.id, to: "SHIPPED" })
    ).toEqual({
      success: false,
      error:
        'O pedido está em "Instalado" e não pode passar para "Em transporte".',
    })

    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
      select: { toStatus: true, changedById: true },
    })
    expect(history.slice(1)).toEqual(
      [
        "IN_PRODUCTION",
        "SEPARATING",
        "INVOICED",
        "SHIPPED",
        "DELIVERED",
        "INSTALLED",
      ].map((toStatus) => ({ toStatus, changedById: admin }))
    )
    expect(
      await prisma.auditLog.count({
        where: { action: "order.status.update", entityId: order.id },
      })
    ).toBe(6)

    const listed = await listAdminOrders({ search: order.number })
    expect(listed.success).toBe(true)
    if (!listed.success) return
    expect(listed.orders[0]).toMatchObject({
      id: order.id,
      status: "INSTALLED",
      nextStatuses: [],
    })
    expect(listed.orders[0].history.at(-1)).toMatchObject({
      from: "DELIVERED",
      to: "INSTALLED",
      by: "Administração Atelier Bureau",
    })
  })

  it("cancels with a reason and releases the reservation", async () => {
    const { order, sku } = await reservedOrder(1)
    await login("admin@atelierbureau.test")
    expect(
      await updateOrderStatus({ orderId: order.id, to: "CANCELED" })
    ).toEqual({ success: false, error: "Informe o motivo do cancelamento." })
    expect(
      await updateOrderStatus({
        orderId: order.id,
        to: "CANCELED",
        cancellationReason: "customer_request",
        note: "Cliente desistiu antes do pagamento",
      })
    ).toEqual({ success: true, status: "CANCELED" })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 1,
      reserved: 0,
    })
    const last = await prisma.orderStatusHistory.findFirstOrThrow({
      where: { orderId: order.id, toStatus: "CANCELED" },
      select: { note: true },
    })
    expect(last.note).toBe(
      "Pedido do cliente: Cliente desistiu antes do pagamento"
    )
  })

  it("keeps personalized items from being canceled after production starts (RN24)", async () => {
    const { order } = await reservedOrder()
    await prisma.orderItem.updateMany({
      where: { orderId: order.id },
      data: { personalization: { engraving: "A.B." } },
    })
    await prisma.$transaction(async (tx) => {
      await transitionOrder(tx, {
        orderId: order.id,
        to: "PAID",
        changedById: null,
      })
      await transitionOrder(tx, {
        orderId: order.id,
        to: "IN_PRODUCTION",
        changedById: null,
      })
    })
    await login("admin@atelierbureau.test")
    const refused = await updateOrderStatus({
      orderId: order.id,
      to: "CANCELED",
      cancellationReason: "customer_request",
    })
    expect(refused.success).toBe(false)
    expect(
      await updateOrderStatus({
        orderId: order.id,
        to: "CANCELED",
        cancellationReason: "defect",
      })
    ).toEqual({ success: true, status: "CANCELED" })
  })

  it("refuses system statuses and users without the permission", async () => {
    const { order } = await reservedOrder()
    await login("admin@atelierbureau.test")
    expect(await updateOrderStatus({ orderId: order.id, to: "PAID" })).toEqual({
      success: false,
      error: "Este status é definido automaticamente pelo sistema.",
    })
    await login("comercial@atelierbureau.test")
    expect(
      await updateOrderStatus({
        orderId: order.id,
        to: "CANCELED",
        cancellationReason: "customer_request",
      })
    ).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true },
    })
    expect(stored.status).toBe("AWAITING_PAYMENT")
  })
})
