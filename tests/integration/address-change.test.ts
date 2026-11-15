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

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { resetCorreiosToken } =
  await import("@/features/shared/lib/correios/correios")
const { confirmAddressChange, getAddressChange, quoteAddressChange } =
  await import("@/features/orders/address-change/action/address-change-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const addresses: string[] = []

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
 * Fake Correios API answering PAC and SEDEX.
 *
 * @param pac - PAC price, Brazilian format.
 * @param sedex - SEDEX price, Brazilian format.
 */
function stubCorreios(pac = "45,90", sedex = "88,10") {
  resetCorreiosToken()
  vi.stubEnv("CORREIOS_USER", "usuario-teste")
  vi.stubEnv("CORREIOS_ACCESS_CODE", "codigo-teste")
  vi.stubEnv("CORREIOS_POSTAGE_CARD", "0000000000")
  vi.stubEnv("CORREIOS_BASE_URL", "https://correios.test")
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const isSedex = url.includes("/03220")
      const body = url.includes("/token/")
        ? { token: "fake-token", expiraEm: "2099-01-01T00:00:00" }
        : url.includes("/preco/")
          ? { pcFinal: isSedex ? sedex : pac }
          : { prazoEntrega: isSedex ? 3 : 8 }
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

/**
 * Creates an order with a PAC shipment of R$ 20,00 for a sellable SKU
 * of the fixtures (1 kg, 10 cm cube: fits the Correios).
 *
 * @param input - Buyer, status, quantity and organization.
 * @returns The order.
 */
async function orderWithShipping(input: {
  email: string
  status?: "AWAITING_PAYMENT" | "AWAITING_APPROVAL" | "PAID"
  quantity?: number
  organizationSlug?: string
}) {
  const sku = await fixtures.createSku(500)
  await prisma.sku.update({
    where: { id: sku.id },
    data: { product: { update: { status: "ACTIVE" } } },
  })
  const order = await fixtures.createOrder({ ...input, sku })
  const subtotal = 100 * (input.quantity ?? 1)
  await prisma.order.update({
    where: { id: order.id },
    data: {
      shippingTotal: "20.00",
      total: (subtotal + 20).toFixed(2),
      shipment: {
        create: {
          method: "CORREIOS_PAC",
          carrier: "Correios",
          service: "PAC",
          price: "20.00",
          deliveryDays: 4,
        },
      },
    },
  })
  return order
}

/**
 * Saves an address in Brasília for a customer or a company.
 *
 * @param owner - User or organization that owns it.
 * @returns The address id.
 */
async function brasiliaAddress(owner: {
  userId?: string
  organizationId?: string
}) {
  const address = await prisma.address.create({
    data: {
      ...owner,
      label: "Filial Brasília (teste)",
      recipient: "Destinatário Fictício",
      cep: "70040010",
      street: "Esplanada dos Ministérios",
      number: "10",
      district: "Zona Cívico-Administrativa",
      city: "Brasília",
      state: "DF",
    },
    select: { id: true },
  })
  addresses.push(address.id)
  return address.id
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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(async () => {
  await prisma.address.deleteMany({ where: { id: { in: addresses } } })
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("shipping re-quote when the address changes (#45, RN15)", () => {
  it("re-quotes shipping and time and shows the difference without changing the order", async () => {
    const order = await orderWithShipping({ email: customer })
    const addressId = await brasiliaAddress({ userId: order.userId })
    await login(customer)
    stubCorreios()

    const context = await getAddressChange({ orderId: order.id })
    expect(context).toMatchObject({
      success: true,
      context: {
        number: order.number,
        changeable: true,
        shipping: { service: "PAC", price: "20.00" },
        total: "120.00",
      },
    })

    const result = await quoteAddressChange({ orderId: order.id, addressId })
    expect(result).toEqual({
      success: true,
      quote: {
        status: "quoted",
        currentShipping: "20.00",
        currentTotal: "120.00",
        newAddress:
          "Esplanada dos Ministérios, 10 · Zona Cívico-Administrativa · Brasília/DF · CEP 70040-010",
        schedule: null,
        options: [
          {
            method: "CORREIOS_PAC",
            carrier: "Correios",
            service: "PAC",
            price: "45.90",
            deliveryDays: 8,
            difference: "25.90",
            newTotal: "145.90",
          },
          {
            method: "CORREIOS_SEDEX",
            carrier: "Correios",
            service: "SEDEX",
            price: "88.10",
            deliveryDays: 3,
            difference: "68.10",
            newTotal: "188.10",
          },
        ],
      },
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { total: true, shippingAddress: true },
    })
    expect(stored.total.toFixed(2)).toBe("120.00")
    expect(stored.shippingAddress).toMatchObject({ cep: "01310100" })
  })

  it("applies the change only after the customer confirms the difference", async () => {
    const order = await orderWithShipping({ email: customer })
    const addressId = await brasiliaAddress({ userId: order.userId })
    await login(customer)
    stubCorreios()

    const result = await confirmAddressChange({
      orderId: order.id,
      addressId,
      option: {
        method: "CORREIOS_SEDEX",
        carrier: "Correios",
        service: "SEDEX",
      },
      expectedShippingPrice: "88.10",
    })
    expect(result).toEqual({
      success: true,
      status: "AWAITING_PAYMENT",
      total: "188.10",
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        shippingTotal: true,
        total: true,
        shippingAddress: true,
        shipment: {
          select: {
            method: true,
            service: true,
            price: true,
            deliveryDays: true,
          },
        },
      },
    })
    expect(stored.status).toBe("AWAITING_PAYMENT")
    expect(stored.shippingTotal.toFixed(2)).toBe("88.10")
    expect(stored.total.toFixed(2)).toBe("188.10")
    expect(stored.shippingAddress).toMatchObject({
      addressId,
      cep: "70040010",
      city: "Brasília",
    })
    expect(stored.shipment).toMatchObject({
      method: "CORREIOS_SEDEX",
      service: "SEDEX",
      deliveryDays: 3,
    })
    expect(stored.shipment?.price.toFixed(2)).toBe("88.10")

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: order.id, action: "order.address_change" },
      select: { userId: true, before: true, after: true },
    })
    expect(audit?.userId).toBe(order.userId)
    expect(audit?.before).toMatchObject({ total: "120.00" })
    expect(audit?.after).toMatchObject({
      total: "188.10",
      shippingTotal: "88.10",
    })
  })

  it("asks the customer to review when the price moved since the quote", async () => {
    const order = await orderWithShipping({ email: customer })
    const addressId = await brasiliaAddress({ userId: order.userId })
    await login(customer)
    stubCorreios("52,00")

    const result = await confirmAddressChange({
      orderId: order.id,
      addressId,
      option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
      expectedShippingPrice: "45.90",
    })
    expect(result).toEqual({
      success: false,
      error:
        "O valor do frete mudou desde a cotação. Confira a nova cotação antes de confirmar.",
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { total: true, shippingAddress: true },
    })
    expect(stored.total.toFixed(2)).toBe("120.00")
    expect(stored.shippingAddress).toMatchObject({ cep: "01310100" })
  })

  it("sends the order to the manual quote when the new address has no price", async () => {
    const order = await orderWithShipping({ email: customer })
    const addressId = await brasiliaAddress({ userId: order.userId })
    await login(customer)
    // No Correios credentials: the API does not quote (RN20)

    const quote = await quoteAddressChange({ orderId: order.id, addressId })
    expect(quote).toMatchObject({
      success: true,
      quote: {
        status: "manual_quote",
        reason: "no_option",
        responseBusinessDays: 2,
        newTotal: "100.00",
        difference: "-20.00",
      },
    })
    const result = await confirmAddressChange({
      orderId: order.id,
      addressId,
      option: null,
      expectedShippingPrice: "0.00",
    })
    expect(result).toEqual({
      success: true,
      status: "AWAITING_SHIPPING_QUOTE",
      total: "100.00",
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        shipment: { select: { method: true, quoteData: true } },
      },
    })
    expect(stored.status).toBe("AWAITING_SHIPPING_QUOTE")
    expect(stored.shipment?.method).toBe("MANUAL_QUOTE")
    expect(stored.shipment?.quoteData).toMatchObject({ reason: "no_option" })
    const outbox = await prisma.emailOutbox.count({
      where: { subject: `Pedido ${order.number}: frete em cotação` },
    })
    expect(outbox).toBe(1)
  })

  it("refuses paid orders and orders with a payment in progress", async () => {
    const paid = await orderWithShipping({ email: customer, status: "PAID" })
    const addressId = await brasiliaAddress({ userId: paid.userId })
    await login(customer)
    stubCorreios()
    expect(await quoteAddressChange({ orderId: paid.id, addressId })).toEqual({
      success: false,
      error:
        "O endereço deste pedido não pode mais ser alterado pelo site. Fale com o atendimento.",
    })
    expect(await getAddressChange({ orderId: paid.id })).toMatchObject({
      success: true,
      context: { changeable: false },
    })

    const pending = await orderWithShipping({ email: customer })
    await prisma.payment.create({
      data: { orderId: pending.id, method: "PIX", amount: "120.00" },
    })
    expect(
      await confirmAddressChange({
        orderId: pending.id,
        addressId,
        option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
        expectedShippingPrice: "45.90",
      })
    ).toEqual({
      success: false,
      error:
        "Este pedido já tem um pagamento em andamento. Fale com o atendimento para alterar o endereço.",
    })
  })

  it("keeps orders and addresses of other customers out of reach", async () => {
    const order = await orderWithShipping({ email: customer })
    const ownAddress = await brasiliaAddress({ userId: order.userId })
    const otherAddress = await brasiliaAddress({
      userId: await userId(requester),
    })
    stubCorreios()

    await login(requester)
    expect(
      await quoteAddressChange({ orderId: order.id, addressId: otherAddress })
    ).toEqual({ success: false, error: "Pedido não encontrado." })

    await login(customer)
    expect(
      await quoteAddressChange({ orderId: order.id, addressId: otherAddress })
    ).toEqual({
      success: false,
      error: "Escolha um dos endereços cadastrados na sua conta.",
    })
    expect(
      await quoteAddressChange({ orderId: order.id, addressId: ownAddress })
    ).toMatchObject({ success: true })

    jar.clear()
    expect(
      await quoteAddressChange({ orderId: order.id, addressId: ownAddress })
    ).toEqual({ success: false, error: "Entre na sua conta para continuar." })
  })

  it("refuses a corporate change that pushes the total above the approval limit (RN01)", async () => {
    // 99 × R$ 100,00 + R$ 20,00 = R$ 9.920,00, below the R$ 10.000,00 limit
    const order = await orderWithShipping({
      email: requester,
      quantity: 99,
      organizationSlug: "empresa-ficticia",
    })
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: "empresa-ficticia" },
      select: { id: true },
    })
    const addressId = await brasiliaAddress({ organizationId: organization.id })
    await login(requester)
    stubCorreios("120,00", "150,00")

    // 99 volumes of the same size: 99 × R$ 120,00 of PAC
    const result = await confirmAddressChange({
      orderId: order.id,
      addressId,
      option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
      expectedShippingPrice: "11880.00",
    })
    expect(result).toEqual({
      success: false,
      error:
        "O novo total exige nova aprovação da empresa. Fale com o atendimento para alterar o endereço.",
    })
  })
})
