import { beforeEach, describe, expect, it, vi } from "vitest"
import { AppError } from "@/features/shared/lib/errors/action-result"

const getCurrentUser = vi.fn()
const enforcePersistentRateLimits = vi.fn()
const getClientIp = vi.fn()

/** Fake Prisma: only what runs before the payment is opened. */
const db = {
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  order: { count: vi.fn(), findFirst: vi.fn() },
}

vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/request/client-ip", () => ({
  getClientIp: () => getClientIp(),
}))
vi.mock(
  "@/features/shared/lib/rate-limit/persistent-limit",
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    enforcePersistentRateLimits: (...args: unknown[]) =>
      enforcePersistentRateLimits(...args),
  })
)

const { payOrder } =
  await import("@/features/payment/order-payment/action/payment-actions")
const { RATE_LIMITED_MESSAGE } =
  await import("@/features/shared/lib/rate-limit/persistent-limit")

const orderId = "019a7b1e-0000-7000-8000-000000000301"
const pix = {
  orderId,
  method: "PIX" as const,
  formData: { payment_method_id: "pix" as const },
}

describe("payOrder rate limit (#175, PCI 8)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    getCurrentUser.mockReset()
    enforcePersistentRateLimits.mockReset()
    getClientIp.mockReset()
    db.$transaction.mockReset()
    db.order.count.mockReset()
    getCurrentUser.mockResolvedValue({ id: "buyer-1" })
    getClientIp.mockResolvedValue("203.0.113.7")
    db.order.count.mockResolvedValue(1)
  })

  it("counts the attempt per order and per proxy IP and refuses it with a generic message", async () => {
    enforcePersistentRateLimits.mockRejectedValue(
      new AppError(RATE_LIMITED_MESSAGE, "rate_limited")
    )

    const result = await payOrder(pix)

    expect(result).toEqual({ success: false, error: RATE_LIMITED_MESSAGE })
    expect(db.order.count).toHaveBeenCalledWith({
      where: { id: orderId, userId: "buyer-1" },
    })
    expect(enforcePersistentRateLimits).toHaveBeenCalledWith(
      [
        { scope: "payment.order", subject: orderId },
        { scope: "payment.ip", subject: "203.0.113.7" },
      ],
      { userId: "buyer-1", action: "payOrder", entityId: orderId }
    )
    expect(db.$transaction).not.toHaveBeenCalled()
  })

  it("never counts an order of someone else", async () => {
    db.order.count.mockResolvedValue(0)

    const result = await payOrder(pix)

    expect(result).toEqual({
      success: false,
      error: "Pedido não encontrado.",
    })
    expect(enforcePersistentRateLimits).not.toHaveBeenCalled()
  })

  it("groups clients without a proxy IP under one key", async () => {
    getClientIp.mockResolvedValue(null)
    enforcePersistentRateLimits.mockRejectedValue(
      new AppError(RATE_LIMITED_MESSAGE, "rate_limited")
    )

    await payOrder(pix)

    expect(enforcePersistentRateLimits).toHaveBeenCalledWith(
      expect.arrayContaining([{ scope: "payment.ip", subject: "unknown" }]),
      expect.anything()
    )
  })
})
