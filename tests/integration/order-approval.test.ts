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
const { decideOrderApproval, listOrderApprovals } =
  await import("@/features/orders/order-approval/action/order-approval-actions")
const { getOrderTracking } =
  await import("@/features/orders/order-tracking/action/order-tracking-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const requester = "solicitante@empresa-ficticia.test"
const approver = "aprovador@empresa-ficticia.test"
const organizationSlug = "empresa-ficticia"

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
 * Creates a corporate order waiting for approval, with one reserved
 * unit of a fresh SKU.
 *
 * @param input - Who placed it and the payment method.
 * @returns The order and the SKU.
 */
async function awaitingOrder(
  input: {
    email?: string
    paymentMethod?: "PIX" | "INVOICED"
    corporate?: boolean
  } = {}
) {
  const sku = await fixtures.createSku(2)
  const order = await fixtures.createOrder({
    email: input.email ?? requester,
    organizationSlug: input.corporate === false ? undefined : organizationSlug,
    status: "AWAITING_APPROVAL",
    paymentMethod: input.paymentMethod ?? "PIX",
    sku,
  })
  await prisma.order.update({
    where: { id: order.id },
    data: { requiresApproval: true },
  })
  await prisma.$transaction((tx) =>
    reserveStock(tx, {
      orderId: order.id,
      items: [{ skuId: sku.id, quantity: 1 }],
      userId: order.userId,
    })
  )
  return { order, sku }
}

/**
 * Queue rows of an order e-mail, by template and recipient.
 *
 * @param number - Order number, part of the subject.
 * @returns Template, recipient and text of each row.
 */
async function emailsFor(number: string) {
  return prisma.emailOutbox.findMany({
    where: { subject: { contains: number } },
    orderBy: { createdAt: "asc" },
    select: { template: true, recipient: true, text: true },
  })
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("corporate order approval (#51, RF11, RN01)", () => {
  it("lists the company orders waiting for approval only to approvers", async () => {
    const { order } = await awaitingOrder()
    const foreign = await awaitingOrder({
      email: "cliente.pf@atelierbureau.test",
      corporate: false,
    })

    await login(requester)
    expect(await listOrderApprovals()).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })

    await login(approver)
    const result = await listOrderApprovals()
    if (!result.success) throw new Error(result.error)
    const ids = result.approvals.pending.map((row) => row.orderId)
    expect(ids).toContain(order.id)
    expect(ids).not.toContain(foreign.order.id)
    expect(
      result.approvals.pending.find((row) => row.orderId === order.id)
    ).toMatchObject({
      number: order.number,
      requester: "Solicitante Empresa Fictícia",
      total: "100.00",
      canDecide: true,
    })
    expect(result.approvals.approvalLimit).toBe("10000.00")
  })

  it("approves with date, user and justification and tells the requester", async () => {
    const { order, sku } = await awaitingOrder()
    const approverId = await userId(approver)
    await login(approver)
    const before = Date.now()

    expect(
      await decideOrderApproval({
        orderId: order.id,
        decision: "APPROVED",
        note: "  Dentro do orçamento do trimestre.  ",
      })
    ).toEqual({
      success: true,
      number: order.number,
      status: "AWAITING_PAYMENT",
    })

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        approvedById: true,
        approvedAt: true,
        approvalNote: true,
        approvals: {
          select: {
            decision: true,
            decidedById: true,
            note: true,
            orderTotal: true,
            createdAt: true,
          },
        },
        statusHistory: {
          select: { fromStatus: true, toStatus: true, changedById: true },
        },
      },
    })
    expect(stored.status).toBe("AWAITING_PAYMENT")
    expect(stored.approvedById).toBe(approverId)
    expect(stored.approvedAt!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(stored.approvalNote).toBe("Dentro do orçamento do trimestre.")
    expect(stored.approvals).toHaveLength(1)
    expect(stored.approvals[0]).toMatchObject({
      decision: "APPROVED",
      decidedById: approverId,
      note: "Dentro do orçamento do trimestre.",
    })
    expect(stored.approvals[0].orderTotal.toFixed(2)).toBe("100.00")
    expect(stored.approvals[0].createdAt).toEqual(stored.approvedAt)
    expect(stored.statusHistory).toEqual([
      {
        fromStatus: "AWAITING_APPROVAL",
        toStatus: "AWAITING_PAYMENT",
        changedById: approverId,
      },
    ])
    // The reservation is kept until the payment
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 2, reserved: 1 })

    const audit = await prisma.auditLog.findFirst({
      where: { action: "order.approve", entityId: order.id },
      select: { userId: true },
    })
    expect(audit).toEqual({ userId: approverId })

    const emails = await emailsFor(order.number)
    expect(
      emails.map(({ template, recipient }) => [template, recipient])
    ).toEqual([["order.approved", requester]])
    expect(emails[0].text).toContain("Dentro do orçamento do trimestre.")

    const tracking = await getOrderTracking({ orderId: order.id })
    if (!tracking.success) throw new Error(tracking.error)
    expect(tracking.tracking.approvals).toMatchObject([
      {
        decision: "APPROVED",
        decidedBy: "Aprovador Empresa Fictícia",
        note: "Dentro do orçamento do trimestre.",
      },
    ])

    const list = await listOrderApprovals()
    if (!list.success) throw new Error(list.error)
    expect(list.approvals.pending.some((row) => row.orderId === order.id)).toBe(
      false
    )
    expect(
      list.approvals.history.find((row) => row.orderId === order.id)
    ).toMatchObject({ decision: "APPROVED", total: "100.00" })
  })

  it("refuses with a required justification, cancels and releases the stock", async () => {
    const { order, sku } = await awaitingOrder()
    const approverId = await userId(approver)
    await login(approver)

    expect(
      await decideOrderApproval({
        orderId: order.id,
        decision: "REJECTED",
        note: "  curto ",
      })
    ).toEqual({
      success: false,
      error: "Explique o motivo da recusa (mínimo de 10 caracteres).",
    })
    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      })
    ).toEqual({ status: "AWAITING_APPROVAL" })

    expect(
      await decideOrderApproval({
        orderId: order.id,
        decision: "REJECTED",
        note: "Fora do orçamento aprovado para o projeto.",
      })
    ).toEqual({ success: true, number: order.number, status: "CANCELED" })

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        approvedById: true,
        approvedAt: true,
        approvals: {
          select: { decision: true, decidedById: true, note: true },
        },
      },
    })
    expect(stored).toEqual({
      status: "CANCELED",
      approvedById: null,
      approvedAt: null,
      approvals: [
        {
          decision: "REJECTED",
          decidedById: approverId,
          note: "Fora do orçamento aprovado para o projeto.",
        },
      ],
    })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 2, reserved: 0 })
    expect(
      await prisma.auditLog.count({
        where: { action: "order.reject", entityId: order.id },
      })
    ).toBe(1)

    const emails = await emailsFor(order.number)
    expect(
      emails.map(({ template, recipient }) => [template, recipient])
    ).toEqual([["order.canceled", requester]])
    expect(emails[0].text).toContain(
      "Justificativa: Fora do orçamento aprovado para o projeto."
    )
  })

  it("does not let the approver decide an order they placed", async () => {
    const { order } = await awaitingOrder({ email: approver })
    await login(approver)

    const list = await listOrderApprovals()
    if (!list.success) throw new Error(list.error)
    expect(
      list.approvals.pending.find((row) => row.orderId === order.id)?.canDecide
    ).toBe(false)

    for (const decision of ["APPROVED", "REJECTED"] as const) {
      expect(
        await decideOrderApproval({
          orderId: order.id,
          decision,
          note: "Tentativa de decidir o próprio pedido.",
        })
      ).toEqual({
        success: false,
        error:
          "O aprovador precisa ser diferente do solicitante. Peça a decisão a outro aprovador da empresa.",
      })
    }
    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true, approvals: { select: { id: true } } },
      })
    ).toEqual({ status: "AWAITING_APPROVAL", approvals: [] })
  })

  it("refuses members without the approver role and orders of other accounts", async () => {
    const { order } = await awaitingOrder()
    const foreign = await awaitingOrder({
      email: "cliente.pf@atelierbureau.test",
      corporate: false,
    })

    await login(requester)
    expect(
      await decideOrderApproval({
        orderId: order.id,
        decision: "APPROVED",
        note: "",
      })
    ).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })

    await login(approver)
    expect(
      await decideOrderApproval({
        orderId: foreign.order.id,
        decision: "APPROVED",
        note: "",
      })
    ).toEqual({ success: false, error: "Pedido não encontrado." })

    jar.clear()
    const visitor = await decideOrderApproval({
      orderId: order.id,
      decision: "APPROVED",
      note: "",
    })
    expect(visitor.success).toBe(false)
    expect(
      await prisma.order.findMany({
        where: { id: { in: [order.id, foreign.order.id] } },
        select: { status: true },
      })
    ).toEqual([
      { status: "AWAITING_APPROVAL" },
      { status: "AWAITING_APPROVAL" },
    ])
  })

  it("decides an order only once", async () => {
    const { order } = await awaitingOrder()
    await login(approver)
    const decide = () =>
      decideOrderApproval({ orderId: order.id, decision: "APPROVED", note: "" })

    const results = await Promise.all([decide(), decide()])
    expect(results.filter((result) => result.success)).toHaveLength(1)
    expect(results.find((result) => !result.success)).toEqual({
      success: false,
      error: "Este pedido não aguarda mais aprovação. Atualize a página.",
    })
    expect(
      await prisma.orderApproval.count({ where: { orderId: order.id } })
    ).toBe(1)
  })

  it("confirms an invoiced order on approval and writes off the stock", async () => {
    const { order, sku } = await awaitingOrder({ paymentMethod: "INVOICED" })
    await login(approver)

    expect(
      await decideOrderApproval({
        orderId: order.id,
        decision: "APPROVED",
        note: "",
      })
    ).toEqual({ success: true, number: order.number, status: "PAID" })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 1, reserved: 0 })
    const emails = await emailsFor(order.number)
    expect(
      emails.map(({ template, recipient }) => [template, recipient])
    ).toEqual([["order.paid", requester]])
  })
})
