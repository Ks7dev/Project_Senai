import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { createHmac, randomUUID } from "node:crypto"
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

// Every test places orders from the same "IP": the action rate limit is
// covered by its own unit tests
vi.mock("@/features/shared/lib/rate-limit/action-limit", () => ({
  enforceActionRateLimit: vi.fn(async () => undefined),
}))

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { addToCart } = await import("@/features/shared/lib/cart/cart-actions")
const { resetCorreiosToken } =
  await import("@/features/shared/lib/correios/correios")
const { getCheckout, placeOrder, quoteCheckoutShipping } =
  await import("@/features/payment/checkout/action/checkout-actions")
const { getOrderPayment, payOrder } =
  await import("@/features/payment/order-payment/action/payment-actions")
const { saveInstallmentRules } =
  await import("@/features/payment/installments/action/installment-actions")
const { expireUnpaidOrders } =
  await import("@/features/shared/lib/orders/order-expiration")
const { reconcilePendingPayments } =
  await import("@/features/shared/lib/payments/payment-reconciliation")
const { POST: mercadoPagoWebhook } =
  await import("@/app/api/webhooks/mercadopago/route")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"
const otherCustomer = "solicitante@empresa-ficticia.test"
const addresses: string[] = []
const placedOrders: string[] = []

/** What the fake Mercado Pago answers to the next payment. */
type MercadoPagoScript =
  | { kind: "answer"; status: string; detail: string; threeDs?: boolean }
  | { kind: "timeout" }
  /** Mercado Pago creates the payment but the answer never arrives. */
  | { kind: "lost"; status: string; detail: string }

let mercadoPago: MercadoPagoScript = {
  kind: "answer",
  status: "approved",
  detail: "accredited",
}
let mercadoPagoRequests: Array<{
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}> = []
let nextProviderId = 7_000_000_000
/** Payments the fake Mercado Pago created, by id (read by GET). */
const issued = new Map<string, Record<string, unknown>>()

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
 * Fake Correios (PAC R$ 45,90, SEDEX R$ 88,10) and Mercado Pago
 * sandbox. Mercado Pago echoes the amount it received, as the real API
 * does, and follows `mercadoPago`.
 */
function stubApis() {
  resetCorreiosToken()
  vi.stubEnv("CORREIOS_USER", "usuario-teste")
  vi.stubEnv("CORREIOS_ACCESS_CODE", "codigo-teste")
  vi.stubEnv("CORREIOS_POSTAGE_CARD", "0000000000")
  vi.stubEnv("CORREIOS_BASE_URL", "https://correios.test")
  vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "TEST-0000")
  vi.stubEnv("MERCADOPAGO_PUBLIC_KEY", "TEST-public-0000")
  vi.stubEnv("MERCADOPAGO_BASE_URL", "https://mp.test")
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url.startsWith("https://mp.test")) {
        const body = JSON.parse(String(init?.body ?? "{}"))
        mercadoPagoRequests.push({
          url,
          headers: init?.headers as Record<string, string>,
          body,
        })
        if (init?.method === "GET") {
          const search = url.split("/v1/payments/search?")[1]
          if (search !== undefined) {
            const reference = new URLSearchParams(search).get(
              "external_reference"
            )
            const results = [...issued.values()].filter(
              (payment) => payment.external_reference === reference
            )
            return new Response(JSON.stringify({ results }), { status: 200 })
          }
          const found = issued.get(url.split("/v1/payments/")[1])
          return found
            ? new Response(JSON.stringify(found), { status: 200 })
            : new Response("{}", { status: 404 })
        }
        if (mercadoPago.kind === "timeout") {
          throw new DOMException("timeout", "TimeoutError")
        }
        nextProviderId += 1
        const created: Record<string, unknown> = {
          id: nextProviderId,
          status: mercadoPago.status,
          status_detail: mercadoPago.detail,
          transaction_amount: body.transaction_amount,
          currency_id: "BRL",
          external_reference: body.external_reference,
          payment_method_id: body.payment_method_id,
          installments: body.installments,
          date_approved:
            mercadoPago.status === "approved" ? new Date().toISOString() : null,
          point_of_interaction:
            body.payment_method_id === "pix"
              ? {
                  transaction_data: {
                    qr_code: "00020126580014br.gov.bcb.pix-teste",
                    qr_code_base64: "iVBORw0KGgo=",
                  },
                }
              : null,
          transaction_details: String(body.payment_method_id).startsWith("bol")
            ? {
                external_resource_url: "https://boleto.test/123.pdf",
                digitable_line:
                  "23793380296000000000000000000000000000000000000",
              }
            : null,
          three_ds_info:
            mercadoPago.kind === "answer" && mercadoPago.threeDs
              ? {
                  external_resource_url: "https://acs.test/challenge",
                  creq: "creq-test",
                }
              : null,
        }
        issued.set(String(nextProviderId), created)
        if (mercadoPago.kind === "lost") {
          throw new DOMException("timeout", "TimeoutError")
        }
        return new Response(JSON.stringify(created), { status: 201 })
      }
      const isSedex = url.includes("/03220")
      const body = url.includes("/token/")
        ? { token: "fake-token", expiraEm: "2099-01-01T00:00:00" }
        : url.includes("/preco/")
          ? { pcFinal: isSedex ? "88,10" : "45,90" }
          : { prazoEntrega: isSedex ? 3 : 8 }
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

/**
 * Creates a sellable SKU (R$ 100,00, 1 kg) with the given stock.
 *
 * @param onHand - Units on hand.
 * @returns The SKU.
 */
async function sellableSku(onHand: number) {
  const sku = await fixtures.createSku(onHand)
  await prisma.sku.update({
    where: { id: sku.id },
    data: { product: { update: { status: "ACTIVE" } } },
  })
  return sku
}

/**
 * Saves an address in Brasília for a customer (Correios, outside the
 * own delivery area).
 *
 * @param userId - Owner.
 * @returns The address id.
 */
async function brasiliaAddress(userId: string) {
  const address = await prisma.address.create({
    data: {
      userId,
      label: "Casa (teste)",
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
 * Empties the active cart of the logged-in customer.
 *
 * @param email - Customer e-mail.
 */
async function emptyCart(email: string) {
  await prisma.cartItem.deleteMany({
    where: { cart: { user: { email }, kind: "CART" } },
  })
}

/**
 * Logs in, fills the cart and places an order paid by card with PAC.
 *
 * @param input - Units on hand and in the cart.
 * @returns The order, the SKU and the address.
 */
async function placeCardOrder(input: {
  onHand?: number
  quantity?: number
  paymentMethod?: "CARD" | "PIX" | "BOLETO"
}) {
  const sku = await sellableSku(input.onHand ?? 10)
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: customer },
    select: { id: true },
  })
  const addressId = await brasiliaAddress(user.id)
  await login(customer)
  await emptyCart(customer)
  stubApis()
  expect(
    await addToCart({ skuCode: sku.code, quantity: input.quantity ?? 2 })
  ).toMatchObject({ success: true })
  const quote = await quoteCheckoutShipping({ addressId })
  if (!quote.success || quote.quote.status !== "quoted") {
    throw new Error("quote failed")
  }
  const pac = quote.quote.options.find((option) => option.service === "PAC")!
  const placed = await placeOrder({
    addressId,
    option: { method: "CORREIOS_PAC", carrier: pac.carrier, service: "PAC" },
    expectedShippingPrice: pac.price,
    expectedTotal: pac.total,
    paymentMethod: input.paymentMethod ?? "CARD",
  })
  if (!placed.success) throw new Error(placed.error)
  placedOrders.push(placed.order.orderId)
  return { order: placed.order, sku, addressId }
}

/** Card data the Payment Brick hands to the action (token only). */
const brickCard = {
  token: "ff8080814c11e237014c1ff593b57b4d",
  issuer_id: "25",
  payment_method_id: "master",
  transaction_amount: 1,
  installments: 1,
  payer: {
    email: "comprador@teste.test",
    identification: { type: "CPF" as const, number: "12345678909" },
  },
}

beforeEach(() => {
  mercadoPago = { kind: "answer", status: "approved", detail: "accredited" }
  mercadoPagoRequests = []
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
  await prisma.paymentNotification.deleteMany({
    where: { resourceId: { in: [...issued.keys()] } },
  })
  await prisma.payment.deleteMany({ where: { orderId: { in: placedOrders } } })
  await prisma.order.deleteMany({ where: { id: { in: placedOrders } } })
  await prisma.address.deleteMany({ where: { id: { in: addresses } } })
  await emptyCart(customer)
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("checkout (#54, RF25, RF43)", () => {
  it("shows the cart, the saved addresses and the card payment", async () => {
    const sku = await sellableSku(5)
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customer },
      select: { id: true },
    })
    const addressId = await brasiliaAddress(user.id)
    await login(customer)
    await emptyCart(customer)
    await addToCart({ skuCode: sku.code, quantity: 1 })

    const result = await getCheckout()
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.context.cart.total).toBe("100.00")
    expect(result.context.addresses.map((address) => address.id)).toContain(
      addressId
    )
    expect(result.context.paymentMethods.map((m) => m.method)).toEqual([
      "CARD",
      "PIX",
      "BOLETO",
    ])
    expect(result.context.paymentMethods[1].note).toContain("30 minutos")
    expect(result.context.paymentMethods[2].note).toContain("3 dias úteis")
    expect(result.context.corporate).toBe(false)
  })

  it("places the order: numbers it, reserves the stock and empties the cart", async () => {
    const { order, sku } = await placeCardOrder({ onHand: 10, quantity: 2 })
    expect(order.number).toMatch(/^AB-\d{4}-\d{6}$/)
    expect(order.status).toBe("AWAITING_PAYMENT")
    expect(order.total).toBe("291.80")
    expect(order.nextUrl).toBe(`/conta/pedidos/${order.orderId}/pagamento`)

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      include: { items: true, shipment: true, statusHistory: true },
    })
    expect(saved.paymentMethod).toBe("CARD")
    expect(saved.subtotal.toFixed(2)).toBe("200.00")
    expect(saved.shippingTotal.toFixed(2)).toBe("91.80")
    expect(saved.items).toHaveLength(1)
    expect(saved.items[0]).toMatchObject({ skuCode: sku.code, quantity: 2 })
    expect(saved.shipment).toMatchObject({
      method: "CORREIOS_PAC",
      service: "PAC",
    })
    expect(saved.statusHistory[0]).toMatchObject({
      fromStatus: null,
      toStatus: "AWAITING_PAYMENT",
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 10,
      reserved: 2,
    })
    const cart = await prisma.cartItem.count({
      where: { cart: { user: { email: customer }, kind: "CART" } },
    })
    expect(cart).toBe(0)
  })

  it("refuses the order when the total changed since the review", async () => {
    const sku = await sellableSku(10)
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customer },
      select: { id: true },
    })
    const addressId = await brasiliaAddress(user.id)
    await login(customer)
    await emptyCart(customer)
    stubApis()
    await addToCart({ skuCode: sku.code, quantity: 1 })

    const result = await placeOrder({
      addressId,
      option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
      expectedShippingPrice: "45.90",
      expectedTotal: "99.90",
      paymentMethod: "CARD",
    })
    expect(result).toEqual({
      success: false,
      error:
        "Os valores do pedido mudaram desde a revisão. Confira o novo total antes de confirmar.",
    })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 10, reserved: 0 })
  })

  it("refuses the order without stock and keeps the cart", async () => {
    const sku = await sellableSku(1)
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: customer },
      select: { id: true },
    })
    const addressId = await brasiliaAddress(user.id)
    await login(customer)
    await emptyCart(customer)
    stubApis()
    await addToCart({ skuCode: sku.code, quantity: 2 })

    const result = await placeOrder({
      addressId,
      option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
      expectedShippingPrice: "91.80",
      expectedTotal: "291.80",
      paymentMethod: "CARD",
    })
    expect(result).toEqual({
      success: false,
      error:
        "Estoque insuficiente para concluir o pedido. Revise as quantidades do carrinho.",
    })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 1, reserved: 0 })
    expect(
      await prisma.cartItem.count({
        where: { cart: { user: { email: customer }, kind: "CART" } },
      })
    ).toBe(1)
  })

  it("only delivers to an address of the buyer", async () => {
    const sku = await sellableSku(5)
    const other = await prisma.user.findUniqueOrThrow({
      where: { email: otherCustomer },
      select: { id: true },
    })
    const foreign = await brasiliaAddress(other.id)
    await login(customer)
    await emptyCart(customer)
    await addToCart({ skuCode: sku.code, quantity: 1 })
    expect(await quoteCheckoutShipping({ addressId: foreign })).toEqual({
      success: false,
      error: "Escolha um dos endereços cadastrados na sua conta.",
    })
  })
})

describe("card payment with the Payment Brick (#54, RF35, RF36, RN13)", () => {
  it("pays with the token, confirms the order and writes off the stock", async () => {
    const { order, sku } = await placeCardOrder({ onHand: 10, quantity: 2 })

    const context = await getOrderPayment({ orderId: order.orderId })
    expect(context).toMatchObject({
      success: true,
      context: {
        canPay: true,
        publicKey: "TEST-public-0000",
        total: "291.80",
      },
    })

    const result = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(result).toMatchObject({
      success: true,
      attempt: {
        orderStatus: "PAID",
        payment: { status: "APPROVED", amount: "291.80" },
        threeDs: null,
      },
    })

    // The server sends the order total, the token and the row id as
    // idempotency key; never a card number (RN19)
    const [request] = mercadoPagoRequests
    expect(request.url).toBe("https://mp.test/v1/payments")
    expect(request.body).toMatchObject({
      transaction_amount: 291.8,
      token: brickCard.token,
      payment_method_id: "master",
      three_d_secure_mode: "optional",
    })
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.orderId },
    })
    expect(request.headers["X-Idempotency-Key"]).toBe(payment.id)
    expect(request.body.external_reference).toBe(payment.id)
    expect(JSON.stringify(payment)).not.toContain(brickCard.token)
    expect(payment.paymentId).toMatch(/^\d+$/)

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      select: { status: true },
    })
    expect(saved.status).toBe("PAID")
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 8, reserved: 0 })
  })

  it("keeps the order waiting when the card is refused and allows a new try", async () => {
    const { order } = await placeCardOrder({})
    mercadoPago = {
      kind: "answer",
      status: "rejected",
      detail: "cc_rejected_insufficient_amount",
    }
    const refused = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(refused).toMatchObject({
      success: true,
      attempt: {
        orderStatus: "AWAITING_PAYMENT",
        payment: {
          status: "REJECTED",
          message: "O cartão não tem limite suficiente.",
        },
      },
    })

    mercadoPago = { kind: "answer", status: "approved", detail: "accredited" }
    const retry = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(retry).toMatchObject({
      success: true,
      attempt: { orderStatus: "PAID" },
    })
    expect(
      await prisma.payment.count({ where: { orderId: order.orderId } })
    ).toBe(2)
  })

  it("hands the 3DS challenge to the Brick and blocks a second payment (RF37)", async () => {
    const { order } = await placeCardOrder({})
    mercadoPago = {
      kind: "answer",
      status: "pending",
      detail: "pending_challenge",
      threeDs: true,
    }
    const result = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(result).toMatchObject({
      success: true,
      attempt: {
        orderStatus: "AWAITING_PAYMENT",
        payment: { status: "PENDING" },
        threeDs: {
          externalResourceUrl: "https://acs.test/challenge",
          creq: "creq-test",
        },
      },
    })

    const again = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(again).toEqual({
      success: false,
      error:
        "Já existe um pagamento em andamento para este pedido. Acompanhe o status nesta página.",
    })
  })

  it("keeps the attempt pending when Mercado Pago does not answer", async () => {
    const { order } = await placeCardOrder({})
    mercadoPago = { kind: "timeout" }
    const result = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(result).toMatchObject({
      success: true,
      attempt: {
        orderStatus: "AWAITING_PAYMENT",
        payment: { status: "PENDING", paymentId: null },
      },
    })
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.orderId },
    })
    expect(payment.statusDetail).toBe("provider_unconfirmed")
  })

  it("refuses card data and other customers' orders", async () => {
    const { order } = await placeCardOrder({})
    const withCard = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: { ...brickCard, card_number: "5031433215406351" } as never,
    })
    expect(withCard).toEqual({ success: false, error: "Pagamento inválido." })

    await login(otherCustomer)
    stubApis()
    expect(
      await payOrder({
        orderId: order.orderId,
        method: "CARD",
        formData: brickCard,
      })
    ).toEqual({ success: false, error: "Pedido não encontrado." })
    expect(mercadoPagoRequests).toHaveLength(0)
  })

  it("tells the customer when online payment is not configured", async () => {
    const { order } = await placeCardOrder({})
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "")
    const context = await getOrderPayment({ orderId: order.orderId })
    expect(context).toMatchObject({
      success: true,
      context: { canPay: false, publicKey: null },
    })
    const result = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(result.success).toBe(false)
    expect(
      await prisma.payment.count({ where: { orderId: order.orderId } })
    ).toBe(0)
  })
})

/** Boleto data the Payment Brick hands to the action. */
const brickBoleto = {
  payment_method_id: "bolbradesco",
  transaction_amount: 1,
  payer: {
    email: "comprador@teste.test",
    first_name: "Cliente",
    last_name: "Fictício",
    identification: { type: "CPF" as const, number: "123.456.789-09" },
    address: {
      zip_code: "70040-010",
      federal_unit: "df",
      city: "Brasília",
      neighborhood: "Zona Cívico-Administrativa",
      street_name: "Esplanada dos Ministérios",
      street_number: "10",
    },
  },
}

describe("Pix and boleto with expiration (#55, RF29, RN14)", () => {
  it("issues the Pix with the configured expiration and shows the QR Code", async () => {
    const { order } = await placeCardOrder({ paymentMethod: "PIX" })
    mercadoPago = {
      kind: "answer",
      status: "pending",
      detail: "pending_waiting_transfer",
    }
    const before = Date.now()
    const result = await payOrder({
      orderId: order.orderId,
      method: "PIX",
      formData: { payment_method_id: "pix" },
    })
    expect(result).toMatchObject({
      success: true,
      attempt: {
        orderStatus: "AWAITING_PAYMENT",
        payment: {
          status: "PENDING",
          pix: {
            qrCode: "00020126580014br.gov.bcb.pix-teste",
            qrCodeImage: "iVBORw0KGgo=",
          },
        },
      },
    })
    const [request] = mercadoPagoRequests
    expect(request.body).toMatchObject({
      payment_method_id: "pix",
      transaction_amount: 291.8,
    })
    expect(request.body).not.toHaveProperty("token")
    const expiresAt = new Date(String(request.body.date_of_expiration))
    expect(expiresAt.getTime() - before).toBeGreaterThanOrEqual(
      30 * 60_000 - 5_000
    )
    expect(expiresAt.getTime() - before).toBeLessThanOrEqual(
      30 * 60_000 + 5_000
    )

    const context = await getOrderPayment({ orderId: order.orderId })
    expect(context).toMatchObject({
      success: true,
      context: {
        canPay: false,
        payments: [{ pix: { qrCodeImage: "iVBORw0KGgo=" } }],
      },
    })
  })

  it("issues the boleto with the digitable line and the PDF", async () => {
    const { order } = await placeCardOrder({ paymentMethod: "BOLETO" })
    mercadoPago = {
      kind: "answer",
      status: "pending",
      detail: "pending_waiting_payment",
    }
    const result = await payOrder({
      orderId: order.orderId,
      method: "BOLETO",
      formData: brickBoleto,
    })
    expect(result).toMatchObject({
      success: true,
      attempt: {
        payment: {
          status: "PENDING",
          boleto: {
            url: "https://boleto.test/123.pdf",
            line: "23793380296000000000000000000000000000000000000",
          },
        },
      },
    })
    const [request] = mercadoPagoRequests
    expect(request.body).toMatchObject({
      payment_method_id: "bolbradesco",
      payer: {
        first_name: "Cliente",
        identification: { type: "CPF", number: "12345678909" },
        address: { zip_code: "70040010", federal_unit: "DF" },
      },
    })
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.orderId },
    })
    // 3 business days ahead, never on a weekend
    const days = (payment.expiresAt!.getTime() - Date.now()) / 86_400_000
    expect(days).toBeGreaterThan(2.9)
    expect(days).toBeLessThan(5.1)
  })

  it("refuses a Pix for an order paid by card", async () => {
    const { order } = await placeCardOrder({ paymentMethod: "CARD" })
    expect(
      await payOrder({
        orderId: order.orderId,
        method: "PIX",
        formData: { payment_method_id: "pix" },
      })
    ).toEqual({ success: false, error: "Forma de pagamento inválida." })
  })

  it("cancels the order and releases the reservation when the Pix expires", async () => {
    const { order, sku } = await placeCardOrder({
      onHand: 10,
      quantity: 2,
      paymentMethod: "PIX",
    })
    mercadoPago = {
      kind: "answer",
      status: "pending",
      detail: "pending_waiting_transfer",
    }
    await payOrder({
      orderId: order.orderId,
      method: "PIX",
      formData: { payment_method_id: "pix" },
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 10,
      reserved: 2,
    })

    const early = await expireUnpaidOrders(new Date(Date.now() + 10 * 60_000))
    expect(early).not.toContain(order.orderId)
    const late = await expireUnpaidOrders(new Date(Date.now() + 31 * 60_000))
    expect(late).toContain(order.orderId)

    const saved = await prisma.order.findUniqueOrThrow({
      where: { id: order.orderId },
      select: { status: true, payments: { select: { status: true } } },
    })
    expect(saved).toEqual({
      status: "CANCELED",
      payments: [{ status: "EXPIRED" }],
    })
    expect(await fixtures.counters(sku.id)).toEqual({
      onHand: 10,
      reserved: 0,
    })
  })

  it("cancels a Pix order whose payment was never issued in time", async () => {
    const { order, sku } = await placeCardOrder({
      onHand: 5,
      quantity: 1,
      paymentMethod: "PIX",
    })
    expect(
      await expireUnpaidOrders(new Date(Date.now() + 10 * 60_000))
    ).not.toContain(order.orderId)
    expect(
      await expireUnpaidOrders(new Date(Date.now() + 31 * 60_000))
    ).toContain(order.orderId)
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 5, reserved: 0 })
  })
})

describe("configurable installments (#56, RF14)", () => {
  it("offers only the installments allowed for the total and refuses more", async () => {
    // 3 units: R$ 300,00 + PAC 3 × R$ 45,90 = R$ 437,70 (PF: up to 3x)
    const { order } = await placeCardOrder({ quantity: 3 })
    const context = await getOrderPayment({ orderId: order.orderId })
    expect(context).toMatchObject({
      success: true,
      context: { total: "437.70", maxInstallments: 3 },
    })

    const tooMany = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: { ...brickCard, installments: 6 },
    })
    expect(tooMany).toEqual({
      success: false,
      error:
        "Este pedido não pode ser parcelado nesse número de vezes. Escolha menos parcelas.",
    })
    expect(mercadoPagoRequests).toHaveLength(0)

    const allowed = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: { ...brickCard, installments: 3 },
    })
    expect(allowed).toMatchObject({
      success: true,
      attempt: { payment: { installments: 3 } },
    })
    expect(mercadoPagoRequests[0].body.installments).toBe(3)
  })

  it("lets only the back office with setting:manage change the ranges", async () => {
    const key = "payment.installment_rules"
    const original = await prisma.setting.findUniqueOrThrow({ where: { key } })
    try {
      await login(customer)
      expect(
        await saveInstallmentRules({
          rules: [
            { profile: "PF", minTotal: "0", maxInstallments: "12" },
            { profile: "PJ", minTotal: "0", maxInstallments: "12" },
          ],
        })
      ).toEqual({
        success: false,
        error: "Você não tem permissão para esta ação.",
      })

      await login("admin@atelierbureau.test")
      const saved = await saveInstallmentRules({
        rules: [
          { profile: "PF", minTotal: "0", maxInstallments: "2" },
          { profile: "PF", minTotal: "200,00", maxInstallments: "5" },
          { profile: "PJ", minTotal: "0", maxInstallments: "1" },
        ],
      })
      expect(saved).toEqual({
        success: true,
        rules: [
          { profile: "PF", minTotal: "0.00", maxInstallments: 2 },
          { profile: "PF", minTotal: "200.00", maxInstallments: 5 },
          { profile: "PJ", minTotal: "0.00", maxInstallments: 1 },
        ],
      })
      expect(
        await prisma.auditLog.count({
          where: { action: "setting.update", entityId: key },
        })
      ).toBeGreaterThan(0)

      // The customer's next payment page follows the new ranges
      const { order } = await placeCardOrder({ quantity: 2 })
      const context = await getOrderPayment({ orderId: order.orderId })
      expect(context).toMatchObject({
        success: true,
        context: { maxInstallments: 5 },
      })
    } finally {
      await prisma.setting.update({
        where: { key },
        data: { value: original.value as never },
      })
    }
  })
})

const webhookSecret = "segredo-do-webhook-de-teste"

/**
 * Builds a Mercado Pago notification signed like the real one.
 *
 * @param dataId - Payment id.
 * @param options - Request id and the secret used to sign.
 * @returns The request.
 */
function notification(
  dataId: string,
  options: { requestId?: string; secret?: string } = {}
) {
  const requestId = options.requestId ?? randomUUID()
  const ts = String(Date.now())
  const v1 = createHmac("sha256", options.secret ?? webhookSecret)
    .update(`id:${dataId};request-id:${requestId};ts:${ts};`)
    .digest("hex")
  return new Request(
    `https://loja.test/api/webhooks/mercadopago?data.id=${dataId}&type=payment`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": `ts=${ts},v1=${v1}`,
      },
      body: JSON.stringify({
        action: "payment.updated",
        type: "payment",
        data: { id: dataId },
      }),
    }
  )
}

/**
 * Places a Pix order and issues the Pix (pending in Mercado Pago).
 *
 * @returns The order, the SKU and the Mercado Pago payment id.
 */
async function pendingPix() {
  const placed = await placeCardOrder({
    onHand: 10,
    quantity: 2,
    paymentMethod: "PIX",
  })
  mercadoPago = {
    kind: "answer",
    status: "pending",
    detail: "pending_waiting_transfer",
  }
  const result = await payOrder({
    orderId: placed.order.orderId,
    method: "PIX",
    formData: { payment_method_id: "pix" },
  })
  if (!result.success || !result.attempt.payment.paymentId) {
    throw new Error("pix not issued")
  }
  return { ...placed, paymentId: result.attempt.payment.paymentId }
}

/**
 * Marks a payment as paid in the fake Mercado Pago.
 *
 * @param paymentId - Mercado Pago payment id.
 * @param status - New status.
 */
function settle(paymentId: string, status = "approved") {
  const payment = issued.get(paymentId)!
  payment.status = status
  payment.status_detail = status === "approved" ? "accredited" : status
  payment.date_approved =
    status === "approved" ? new Date().toISOString() : null
}

/**
 * Status of an order and of its payments.
 *
 * @param orderId - Order id.
 * @returns The statuses.
 */
async function statusOf(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      payments: { select: { status: true }, orderBy: { createdAt: "asc" } },
    },
  })
}

describe("Mercado Pago webhook (#57, RF30, RN13)", () => {
  beforeEach(() => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", webhookSecret)
  })

  it("validates the signature and confirms the order only once", async () => {
    const { order, sku, paymentId } = await pendingPix()
    settle(paymentId)
    const requestId = randomUUID()

    const first = await mercadoPagoWebhook(
      notification(paymentId, { requestId })
    )
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ ok: true, status: "processed" })
    expect(await statusOf(order.orderId)).toEqual({
      status: "PAID",
      payments: [{ status: "APPROVED" }],
    })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 8, reserved: 0 })

    // The same delivery again and a new delivery of the same payment
    const repeated = await mercadoPagoWebhook(
      notification(paymentId, { requestId })
    )
    expect(await repeated.json()).toEqual({ ok: true, status: "duplicate" })
    const again = await mercadoPagoWebhook(notification(paymentId))
    expect(again.status).toBe(200)
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.orderId, toStatus: "PAID" },
      })
    ).toBe(1)
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 8, reserved: 0 })
  })

  it("refuses a notification with an invalid signature", async () => {
    const { order, paymentId } = await pendingPix()
    settle(paymentId)
    const forged = await mercadoPagoWebhook(
      notification(paymentId, { secret: "outro-segredo" })
    )
    expect(forged.status).toBe(401)
    const unsigned = await mercadoPagoWebhook(
      new Request(
        `https://loja.test/api/webhooks/mercadopago?data.id=${paymentId}&type=payment`,
        { method: "POST", body: "{}" }
      )
    )
    expect(unsigned.status).toBe(401)
    expect((await statusOf(order.orderId)).status).toBe("AWAITING_PAYMENT")
  })

  it("refuses every notification without the secret configured", async () => {
    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "")
    const response = await mercadoPagoWebhook(notification("123"))
    expect(response.status).toBe(503)
  })

  it("does not confirm the order without approved", async () => {
    const { order, paymentId } = await pendingPix()
    settle(paymentId, "in_process")
    await mercadoPagoWebhook(notification(paymentId))
    expect(await statusOf(order.orderId)).toEqual({
      status: "AWAITING_PAYMENT",
      payments: [{ status: "PENDING" }],
    })

    settle(paymentId, "rejected")
    await mercadoPagoWebhook(notification(paymentId))
    expect(await statusOf(order.orderId)).toEqual({
      status: "AWAITING_PAYMENT",
      payments: [{ status: "REJECTED" }],
    })
  })

  it("ignores other topics, even when signed", async () => {
    const signed = notification("123")
    const url = signed.url.replace("type=payment", "type=merchant_order")
    const response = await mercadoPagoWebhook(
      new Request(url, {
        method: "POST",
        headers: signed.headers,
        body: JSON.stringify({ type: "merchant_order", data: { id: "123" } }),
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, ignored: true })
    expect(
      await prisma.paymentNotification.count({ where: { resourceId: "123" } })
    ).toBe(0)
  })
})

describe("reconciliation by GET /v1/payments/{id} (#57)", () => {
  it("confirms a payment whose webhook never arrived", async () => {
    const { order, paymentId } = await pendingPix()
    settle(paymentId)
    await reconcilePendingPayments({
      now: new Date(Date.now() + 2 * 60_000),
    })
    expect(await statusOf(order.orderId)).toEqual({
      status: "PAID",
      payments: [{ status: "APPROVED" }],
    })
  })

  it("finds by the external reference a payment created without answer", async () => {
    const { order } = await placeCardOrder({})
    mercadoPago = { kind: "lost", status: "approved", detail: "accredited" }
    const attempt = await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(attempt).toMatchObject({
      success: true,
      attempt: { payment: { status: "PENDING", paymentId: null } },
    })
    await reconcilePendingPayments({
      now: new Date(Date.now() + 2 * 60_000),
    })
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.orderId },
    })
    expect(payment.status).toBe("APPROVED")
    expect(payment.paymentId).toMatch(/^\d+$/)
    expect((await statusOf(order.orderId)).status).toBe("PAID")
  })

  it("gives up an attempt Mercado Pago never registered, so the customer pays again", async () => {
    const { order } = await placeCardOrder({})
    mercadoPago = { kind: "timeout" }
    await payOrder({
      orderId: order.orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(
      (await getOrderPayment({ orderId: order.orderId })).success &&
        (await getOrderPayment({ orderId: order.orderId }))
    ).toMatchObject({ context: { canPay: false } })

    await reconcilePendingPayments({
      now: new Date(Date.now() + 16 * 60_000),
    })
    const payment = await prisma.payment.findFirstOrThrow({
      where: { orderId: order.orderId },
    })
    expect(payment).toMatchObject({
      status: "CANCELED",
      statusDetail: "provider_not_found",
    })
    expect(await getOrderPayment({ orderId: order.orderId })).toMatchObject({
      success: true,
      context: { canPay: true },
    })
  })

  it("confirms a Pix paid at the last minute instead of expiring it", async () => {
    const { order, paymentId } = await pendingPix()
    settle(paymentId)
    const later = new Date(Date.now() + 31 * 60_000)
    await reconcilePendingPayments({ now: later, expiredOnly: true })
    expect(await expireUnpaidOrders(later)).not.toContain(order.orderId)
    expect((await statusOf(order.orderId)).status).toBe("PAID")
  })
})
