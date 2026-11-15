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
const { transitionOrder } =
  await import("@/features/shared/lib/orders/order-lifecycle")
const { updateOrderStatus } =
  await import("@/features/orders/order-management/action/order-management-actions")
const { getOrderTracking } =
  await import("@/features/orders/order-tracking/action/order-tracking-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const approver = "aprovador@empresa-ficticia.test"

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
 * Creates a paid order shipped by PAC.
 *
 * @param email - Buyer.
 * @param organizationSlug - Corporate account of the order, if any.
 * @returns The order.
 */
async function paidOrder(email: string, organizationSlug?: string) {
  const sku = await fixtures.createSku(5)
  const order = await fixtures.createOrder({ email, sku, organizationSlug })
  await prisma.shipment.create({
    data: {
      orderId: order.id,
      method: "CORREIOS_PAC",
      carrier: "Correios",
      service: "PAC",
      price: "45.90",
      deliveryDays: 8,
    },
  })
  await prisma.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: "AWAITING_PAYMENT" },
  })
  await prisma.$transaction((tx) =>
    transitionOrder(tx, { orderId: order.id, to: "PAID", changedById: null })
  )
  return order
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("order tracking (#66, RF15)", () => {
  it("shows the timeline with every status and no code before shipping", async () => {
    const order = await paidOrder(customer)
    await login(customer)
    const result = await getOrderTracking({ orderId: order.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    const { tracking } = result
    expect(tracking.number).toBe(order.number)
    expect(tracking.status).toBe("PAID")
    expect(tracking.ownOrder).toBe(true)
    expect(
      tracking.timeline.map((step) => `${step.status}:${step.state}`)
    ).toEqual([
      "AWAITING_PAYMENT:done",
      "PAID:current",
      "SEPARATING:pending",
      "INVOICED:pending",
      "SHIPPED:pending",
      "DELIVERED:pending",
    ])
    expect(tracking.timeline[1].at).not.toBeNull()
    expect(tracking.shipment).toMatchObject({
      carrier: "Correios",
      service: "PAC",
      trackingCode: null,
      trackingUrl: null,
    })
  })

  it("shows the tracking code saved when the back office ships the order", async () => {
    const order = await paidOrder(customer)
    await login("admin@atelierbureau.test")
    for (const to of ["SEPARATING", "INVOICED"] as const) {
      expect(await updateOrderStatus({ orderId: order.id, to })).toMatchObject({
        success: true,
      })
    }
    expect(
      await updateOrderStatus({
        orderId: order.id,
        to: "SHIPPED",
        trackingCode: "aa123456789br",
      })
    ).toEqual({ success: true, status: "SHIPPED" })
    expect(
      await updateOrderStatus({
        orderId: order.id,
        to: "DELIVERED",
        trackingCode: "<script>",
      })
    ).toMatchObject({ success: false })

    await login(customer)
    const result = await getOrderTracking({ orderId: order.id })
    if (!result.success) throw new Error(result.error)
    expect(result.tracking.shipment).toMatchObject({
      trackingCode: "AA123456789BR",
      trackingUrl: "https://rastreamento.correios.com.br/app/index.php",
    })
    expect(result.tracking.shipment?.shippedAt).not.toBeNull()
    expect(
      result.tracking.timeline.find((step) => step.status === "SHIPPED")
    ).toMatchObject({ state: "current" })
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: order.id,
        action: "order.status.update",
        after: { path: "$.status", equals: "SHIPPED" },
      },
    })
    expect(JSON.stringify(audit.after)).toContain("AA123456789BR")
  })

  it("does not show the order of another customer", async () => {
    const order = await paidOrder(customer)
    await login(requester)
    expect(await getOrderTracking({ orderId: order.id })).toEqual({
      success: false,
      error: "Pedido não encontrado.",
    })
    expect(await getOrderTracking({ orderId: "nao-e-um-id" })).toEqual({
      success: false,
      error: "Pedido inválido.",
    })
    jar.clear()
    expect(await getOrderTracking({ orderId: order.id })).toMatchObject({
      success: false,
    })
  })

  it("lets the company approver follow the requester's orders", async () => {
    const order = await paidOrder(requester, "empresa-ficticia")
    await login(approver)
    const result = await getOrderTracking({ orderId: order.id })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.tracking.ownOrder).toBe(false)
  })
})
