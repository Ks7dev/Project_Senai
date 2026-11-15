import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
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

vi.mock("@/features/shared/lib/rate-limit/action-limit", () => ({
  enforceActionRateLimit: vi.fn(async () => undefined),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { addToCart } = await import("@/features/shared/lib/cart/cart-actions")
const { getCheckout, placeOrder, quoteCheckoutShipping } =
  await import("@/features/payment/checkout/action/checkout-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"
const addresses: string[] = []
const placedOrders: string[] = []
const capacityKey = "installation.daily_capacity"
let savedCapacity: unknown

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
 * Creates a sellable SKU of furniture that needs installation (RN05).
 *
 * @param onHand - Units on hand.
 * @returns The SKU.
 */
async function furnitureSku(onHand: number) {
  const sku = await fixtures.createSku(onHand)
  await prisma.sku.update({
    where: { id: sku.id },
    data: {
      product: { update: { status: "ACTIVE", requiresInstallation: true } },
    },
  })
  return sku
}

/**
 * Saves an address in São Paulo (own delivery with installation).
 *
 * @param userId - Owner.
 * @returns The address id.
 */
async function saoPauloAddress(userId: string) {
  const address = await prisma.address.create({
    data: {
      userId,
      label: "Escritório (teste)",
      recipient: "Destinatário Fictício",
      cep: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    select: { id: true },
  })
  addresses.push(address.id)
  return address.id
}

/** Empties the active cart of the customer. */
async function emptyCart() {
  await prisma.cartItem.deleteMany({
    where: { cart: { user: { email: customer }, kind: "CART" } },
  })
}

/**
 * Fills the cart with furniture and quotes the own delivery.
 *
 * @returns The address, the SKU, the option and the calendar.
 */
async function quoteFurniture() {
  const sku = await furnitureSku(10)
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: customer },
    select: { id: true },
  })
  const addressId = await saoPauloAddress(user.id)
  await login(customer)
  await emptyCart()
  expect(await addToCart({ skuCode: sku.code, quantity: 1 })).toMatchObject({
    success: true,
  })
  const quote = await quoteCheckoutShipping({ addressId })
  if (!quote.success || quote.quote.status !== "quoted") {
    throw new Error("quote failed")
  }
  const option = quote.quote.options.find(
    (item) => item.method === "OWN_DELIVERY"
  )
  if (!option || !quote.quote.schedule) throw new Error("no own delivery")
  return { sku, addressId, option, schedule: quote.quote.schedule }
}

/**
 * Places the furniture order with an installation date.
 *
 * @param input - Quote and date.
 * @returns The action result.
 */
async function place(
  input: Awaited<ReturnType<typeof quoteFurniture>>,
  installationDate: string | null
) {
  const result = await placeOrder({
    addressId: input.addressId,
    option: {
      method: "OWN_DELIVERY",
      carrier: input.option.carrier,
      service: input.option.service,
    },
    expectedShippingPrice: input.option.price,
    expectedTotal: input.option.total,
    paymentMethod: "PIX",
    installationDate,
  })
  if (result.success) placedOrders.push(result.order.orderId)
  return result
}

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  savedCapacity = (
    await prisma.setting.findUniqueOrThrow({ where: { key: capacityKey } })
  ).value
})

afterEach(async () => {
  await prisma.setting.update({
    where: { key: capacityKey },
    data: { value: savedCapacity as never },
  })
  vi.restoreAllMocks()
})

afterAll(async () => {
  const numbers = await prisma.order.findMany({
    where: { id: { in: placedOrders } },
    select: { number: true },
  })
  if (numbers.length > 0) {
    await prisma.emailOutbox.deleteMany({
      where: {
        OR: numbers.map(({ number }) => ({ subject: { contains: number } })),
      },
    })
  }
  await prisma.order.deleteMany({ where: { id: { in: placedOrders } } })
  await prisma.address.deleteMany({ where: { id: { in: addresses } } })
  await emptyCart()
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("delivery and installation scheduling (#53, RF16, RN05)", () => {
  it("asks for a date only when the cart has furniture with installation", async () => {
    const plain = await fixtures.createSku(5)
    await prisma.sku.update({
      where: { id: plain.id },
      data: { product: { update: { status: "ACTIVE" } } },
    })
    await login(customer)
    await emptyCart()
    await addToCart({ skuCode: plain.code, quantity: 1 })
    const without = await getCheckout()
    expect(without.success && without.context.installation).toEqual({
      required: false,
      products: [],
    })

    const sku = await furnitureSku(5)
    await addToCart({ skuCode: sku.code, quantity: 1 })
    const withFurniture = await getCheckout()
    expect(withFurniture.success).toBe(true)
    if (!withFurniture.success) return
    expect(withFurniture.context.installation.required).toBe(true)
    expect(withFurniture.context.installation.products).toHaveLength(1)
  })

  it("offers a calendar with weekends, holidays and early dates blocked", async () => {
    const { option, schedule } = await quoteFurniture()
    expect(schedule).toHaveLength(45)
    expect(option.earliestInstallationDate).toBe(schedule[0].date)
    for (const day of schedule) {
      const weekday = new Date(`${day.date}T12:00:00.000Z`).getUTCDay()
      if (weekday === 0 || weekday === 6) {
        expect(day).toMatchObject({ available: false, reason: "weekday" })
      }
    }
    const holiday = schedule.find((day) => day.date === "2026-12-25")
    if (holiday) expect(holiday.reason).toBe("blocked")
    expect(schedule[0].date > new Date().toISOString().slice(0, 10)).toBe(true)
  })

  it("does not place the order without a date and keeps the cart", async () => {
    const quoted = await quoteFurniture()
    const result = await place(quoted, null)
    expect(result).toEqual({
      success: false,
      error: "Escolha a data de entrega e instalação para finalizar o pedido.",
    })
    expect(await fixtures.counters(quoted.sku.id)).toEqual({
      onHand: 10,
      reserved: 0,
    })
    expect(
      await prisma.cartItem.count({
        where: { cart: { user: { email: customer }, kind: "CART" } },
      })
    ).toBe(1)
  })

  it("refuses a blocked date", async () => {
    const quoted = await quoteFurniture()
    const weekend = quoted.schedule.find((day) => day.reason === "weekday")!
    expect(await place(quoted, weekend.date)).toEqual({
      success: false,
      error:
        "A data de entrega e instalação escolhida não está disponível. Escolha outra data.",
    })
    const past = await place(quoted, "2026-01-05")
    expect(past.success).toBe(false)
    expect(await fixtures.counters(quoted.sku.id)).toEqual({
      onHand: 10,
      reserved: 0,
    })
  })

  it("schedules a free date and blocks it when the agenda is full", async () => {
    const first = await quoteFurniture()
    const day = first.schedule.find((item) => item.available)!
    const booked = await prisma.order.count({
      where: {
        scheduledDeliveryAt: new Date(`${day.date}T15:00:00.000Z`),
        status: { notIn: ["CANCELED", "REFUNDED"] },
      },
    })
    await prisma.setting.update({
      where: { key: capacityKey },
      data: { value: booked + 1 },
    })

    const placed = await place(first, day.date)
    expect(placed.success).toBe(true)
    if (!placed.success) return
    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: placed.order.orderId },
      select: { scheduledDeliveryAt: true },
    })
    expect(saved.scheduledDeliveryAt?.toISOString()).toBe(
      `${day.date}T15:00:00.000Z`
    )
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entity: "order", entityId: placed.order.orderId },
    })
    expect(JSON.stringify(audit.after)).toContain(day.date)

    const second = await quoteFurniture()
    expect(second.schedule.find((item) => item.date === day.date)).toEqual({
      date: day.date,
      available: false,
      reason: "full",
    })
    expect(await place(second, day.date)).toEqual({
      success: false,
      error:
        "A data de entrega e instalação escolhida não está disponível. Escolha outra data.",
    })

    // A canceled order frees its slot
    await prisma.order.update({
      where: { id: placed.order.orderId },
      data: { status: "CANCELED" },
    })
    const third = await quoteFurniture()
    expect(
      third.schedule.find((item) => item.date === day.date)?.available
    ).toBe(true)
  })
})
