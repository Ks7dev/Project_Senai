import { randomUUID } from "node:crypto"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { jar } from "./next-headers-stub"

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
const { lookupAddressByCep } =
  await import("@/features/shared/lib/viacep/cep-actions")
const { saveAddress, deleteAddress } =
  await import("@/features/account/addresses/action/address-actions")

const { quoteShipping } =
  await import("@/features/shared/lib/shipping/shipping-actions")
const { resetCorreiosToken } =
  await import("@/features/shared/lib/correios/correios")

const { listShippingRegions, saveShippingRegion, toggleShippingRegion } =
  await import("@/features/shipping/regions/action/region-actions")

const { notifyManualQuoteRequested, sendOrderToManualShippingQuote } =
  await import("@/features/shared/lib/shipping/manual-quote")
const { answerManualShippingQuote, listManualShippingQuotes } =
  await import("@/features/shipping/manual-quotes/action/manual-quote-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"

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

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe("address lookup by CEP (#39, RF22–RF24, RF38, RN21)", () => {
  it("validates the 8 digits before calling ViaCEP", async () => {
    const fetcher = vi.fn()
    vi.stubGlobal("fetch", fetcher)
    const result = await lookupAddressByCep({ cep: "0131-01" })
    expect(result).toEqual({ success: false, error: "CEP deve ter 8 números." })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("fills the address from ViaCEP", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              logradouro: "Avenida Paulista",
              bairro: "Bela Vista",
              localidade: "São Paulo",
              uf: "SP",
            })
          )
      )
    )
    const result = await lookupAddressByCep({ cep: "01310-100" })
    expect(result).toEqual({
      success: true,
      lookup: {
        status: "found",
        complete: true,
        address: {
          street: "Avenida Paulista",
          district: "Bela Vista",
          city: "São Paulo",
          state: "SP",
        },
      },
    })
  })

  it("frees manual typing and still saves the address when ViaCEP is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed")
      })
    )
    const lookup = await lookupAddressByCep({ cep: "01310100" })
    expect(lookup).toEqual({
      success: true,
      lookup: { status: "unavailable" },
    })

    await login("cliente.pf@atelierbureau.test")
    const saved = await saveAddress({
      label: "Digitado à mão",
      recipient: "Cliente Pessoa Física",
      cep: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    })
    expect(saved.success).toBe(true)
    if (saved.success) {
      expect(await deleteAddress({ id: saved.id })).toEqual({ success: true })
      await prisma.address.delete({ where: { id: saved.id } })
    }
  })
})

describe("shipping strategies against MySQL (#40, RF25, RN20)", () => {
  it("prices own delivery with assembly inside the RMSP by billable weight", async () => {
    // Desk: 62 kg real, 160 × 80 × 12 cm (25.6 kg cubed) → 100 kg rate
    const result = await quoteShipping({
      cep: "01310-100",
      items: [{ skuCode: "MOB-MES-REG-CAR", quantity: 1 }],
    })
    expect(result).toEqual({
      success: true,
      quote: {
        status: "quoted",
        strategy: "own_delivery",
        options: [
          {
            method: "OWN_DELIVERY",
            carrier: "Atelier Bureau",
            service: "Entrega própria com montagem",
            price: "240.00",
            deliveryDays: null,
          },
        ],
        coverage: {
          ownDelivery: true,
          regionName: "Região Metropolitana de São Paulo",
        },
      },
    })
  })

  it("sends assembly outside the coverage area to the manual quote", async () => {
    const result = await quoteShipping({
      cep: "70040-010",
      items: [{ skuCode: "MOB-MES-REG-CAR", quantity: 1 }],
    })
    expect(result).toMatchObject({
      success: true,
      quote: {
        status: "manual_quote",
        reason: "assembly_outside_coverage",
        coverage: { ownDelivery: false },
      },
    })
  })

  it("falls back to the manual quote while the Correios API is not wired", async () => {
    const result = await quoteShipping({
      cep: "01310-100",
      items: [{ skuCode: "PAP-CAD-A5-CAR", quantity: 2 }],
    })
    expect(result).toMatchObject({
      success: true,
      quote: {
        status: "manual_quote",
        reason: "no_option",
        responseBusinessDays: 2,
      },
    })
  })

  it("quotes PAC and SEDEX in the Correios API for small volumes (#41)", async () => {
    resetCorreiosToken()
    vi.stubEnv("CORREIOS_USER", "usuario-teste")
    vi.stubEnv("CORREIOS_ACCESS_CODE", "codigo-teste")
    vi.stubEnv("CORREIOS_POSTAGE_CARD", "0000000000")
    vi.stubEnv("CORREIOS_BASE_URL", "https://correios.test")
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input)
        urls.push(url)
        const sedex = url.includes("/03220")
        const body = url.includes("/token/")
          ? { token: "fake-token", expiraEm: "2099-01-01T00:00:00" }
          : url.includes("/preco/")
            ? { pcFinal: sedex ? "39,50" : "21,30" }
            : { prazoEntrega: sedex ? 2 : 6 }
        return new Response(JSON.stringify(body), { status: 200 })
      })
    )
    const result = await quoteShipping({
      cep: "70040-010",
      items: [{ skuCode: "PAP-CAD-A5-CAR", quantity: 2 }],
    })
    expect(result).toEqual({
      success: true,
      quote: {
        status: "quoted",
        strategy: "correios",
        options: [
          {
            method: "CORREIOS_PAC",
            carrier: "Correios",
            service: "PAC",
            price: "42.60",
            deliveryDays: 6,
          },
          {
            method: "CORREIOS_SEDEX",
            carrier: "Correios",
            service: "SEDEX",
            price: "79.00",
            deliveryDays: 2,
          },
        ],
        coverage: { ownDelivery: false, regionName: null },
      },
    })
    // Origin from the settings table, weight from the product (450 g)
    expect(urls.find((url) => url.includes("/preco/"))).toContain(
      "cepOrigem=04538133"
    )
    expect(urls.find((url) => url.includes("/preco/"))).toContain(
      "psObjeto=450"
    )
  })

  it("falls back to the manual quote when the Correios API fails (#41)", async () => {
    resetCorreiosToken()
    vi.stubEnv("CORREIOS_USER", "usuario-teste")
    vi.stubEnv("CORREIOS_ACCESS_CODE", "codigo-teste")
    vi.stubEnv("CORREIOS_POSTAGE_CARD", "0000000000")
    vi.stubEnv("CORREIOS_BASE_URL", "https://correios.test")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    )
    const result = await quoteShipping({
      cep: "70040-010",
      items: [{ skuCode: "PAP-CAD-A5-CAR", quantity: 1 }],
    })
    expect(result).toMatchObject({
      success: true,
      quote: { status: "manual_quote", reason: "no_option" },
    })
  })

  it("refuses unknown products and invalid CEPs", async () => {
    expect(
      await quoteShipping({
        cep: "01310100",
        items: [{ skuCode: "NAO-EXISTE", quantity: 1 }],
      })
    ).toEqual({
      success: false,
      error: "Um dos produtos não está disponível para calcular o frete.",
    })
    expect(
      await quoteShipping({
        cep: "123",
        items: [{ skuCode: "PAP-CAD-A5-CAR", quantity: 1 }],
      })
    ).toEqual({ success: false, error: "CEP deve ter 8 números." })
  })
})

describe("own delivery regions in the back office (#43, RF27, RF50, RN16)", () => {
  const desk = [{ skuCode: "MOB-MES-REG-CAR", quantity: 1 }]

  it("lets the admin create, price and deactivate a CEP range", async () => {
    await login("admin@atelierbureau.test")
    const saved = await saveShippingRegion({
      name: "Campinas (teste)",
      cepStart: "13000-000",
      cepEnd: "13139-999",
      ownDelivery: true,
      rates: [
        { maxKg: "200", price: "520,00" },
        { maxKg: "50", price: "310,50" },
      ],
      freeShippingMinimum: "",
      active: true,
    })
    expect(saved.success).toBe(true)
    if (!saved.success) return
    try {
      const listed = await listShippingRegions()
      const region =
        listed.success && listed.regions.find((item) => item.id === saved.id)
      expect(region).toMatchObject({
        cepStart: "13000000",
        cepEnd: "13139999",
        rates: [
          { maxKg: "50", price: "310.50" },
          { maxKg: "200", price: "520.00" },
        ],
        freeShippingMinimum: "",
      })
      expect(
        await prisma.auditLog.count({
          where: { entityId: saved.id, action: "shipping_region.create" },
        })
      ).toBe(1)

      // Desk: 62 kg billable → 200 kg rate of the new region
      expect(await quoteShipping({ cep: "13010-000", items: desk })).toEqual({
        success: true,
        quote: {
          status: "quoted",
          strategy: "own_delivery",
          options: [expect.objectContaining({ price: "520.00" })],
          coverage: { ownDelivery: true, regionName: "Campinas (teste)" },
        },
      })

      const edited = await saveShippingRegion({
        id: saved.id,
        name: "Campinas (teste)",
        cepStart: "13000000",
        cepEnd: "13139999",
        ownDelivery: true,
        rates: [{ maxKg: "100", price: "400" }],
        freeShippingMinimum: "3000,00",
        active: true,
      })
      expect(edited).toEqual({ success: true, id: saved.id })
      const quoted = await quoteShipping({ cep: "13010000", items: desk })
      expect(quoted.success && quoted.quote.status === "quoted").toBe(true)
      if (quoted.success && quoted.quote.status === "quoted") {
        expect(quoted.quote.options[0]?.price).toBe("400.00")
      }

      expect(
        await toggleShippingRegion({ id: saved.id, active: false })
      ).toEqual({ success: true })
      expect(await quoteShipping({ cep: "13010000", items: desk })).toEqual({
        success: true,
        quote: {
          status: "manual_quote",
          reason: "assembly_outside_coverage",
          coverage: { ownDelivery: false, regionName: null },
          responseBusinessDays: 2,
        },
      })
    } finally {
      await prisma.shippingRegion.delete({ where: { id: saved.id } })
    }
  })

  it("refuses a range that overlaps an active region", async () => {
    await login("admin@atelierbureau.test")
    const result = await saveShippingRegion({
      name: "Sobreposta",
      cepStart: "09000000",
      cepEnd: "11000000",
      ownDelivery: false,
      rates: [],
      active: true,
    })
    expect(result).toEqual({
      success: false,
      error:
        'A faixa de CEP se sobrepõe à região "Região Metropolitana de São Paulo".',
    })
  })

  it("keeps the coverage table out of reach of other profiles", async () => {
    await login("comercial@atelierbureau.test")
    expect((await listShippingRegions()).success).toBe(false)
    expect(
      (
        await saveShippingRegion({
          name: "Sem permissão",
          cepStart: "80000000",
          cepEnd: "80999999",
          ownDelivery: false,
          rates: [],
          active: true,
        })
      ).success
    ).toBe(false)
    expect(
      await prisma.shippingRegion.count({ where: { name: "Sem permissão" } })
    ).toBe(0)
  })
})

describe("manual shipping quote queue (#44, RN16, RN20)", () => {
  const created: string[] = []

  /**
   * Creates an order as the checkout will, with one desk line.
   *
   * @param input - Buyer e-mail, company and subtotal.
   * @returns The order id and number.
   */
  async function createOrder(input: {
    email: string
    organizationSlug?: string
    subtotal: string
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
    const sku = await prisma.sku.findUniqueOrThrow({
      where: { code: "MOB-MES-REG-CAR" },
      select: { id: true, code: true, product: { select: { name: true } } },
    })
    const order = await prisma.order.create({
      data: {
        number: `AB-T-${Date.now().toString().slice(-9)}${created.length}`,
        userId: user.id,
        organizationId: organization?.id ?? null,
        status: "AWAITING_PAYMENT",
        paymentMethod: "PIX",
        subtotal: input.subtotal,
        total: input.subtotal,
        shippingAddress: { cep: "70040010", city: "Brasília", state: "DF" },
        items: {
          create: {
            skuId: sku.id,
            productName: sku.product.name,
            skuCode: sku.code,
            quantity: 1,
            unitPrice: input.subtotal,
            total: input.subtotal,
          },
        },
      },
      select: { id: true, number: true, userId: true },
    })
    created.push(order.id)
    return order
  }

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { id: { in: created } } })
  })

  it("sends the order to the sales queue and gives the customer the return time", async () => {
    const order = await createOrder({
      email: "cliente.pf@atelierbureau.test",
      subtotal: "4890.00",
    })
    // Friday 12:00 in São Paulo → 2 business days → Tuesday
    const now = new Date("2026-11-13T15:00:00.000Z")
    const queued = await prisma.$transaction((tx) =>
      sendOrderToManualShippingQuote(tx, {
        orderId: order.id,
        reason: "assembly_outside_coverage",
        changedById: order.userId,
        now,
      })
    )
    expect(queued).toEqual({
      businessDays: 2,
      respondBy: new Date("2026-11-17T15:00:00.000Z"),
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        shipment: { select: { method: true, quoteData: true } },
        statusHistory: { select: { toStatus: true } },
      },
    })
    expect(stored).toEqual({
      status: "AWAITING_SHIPPING_QUOTE",
      shipment: {
        method: "MANUAL_QUOTE",
        quoteData: {
          reason: "assembly_outside_coverage",
          requestedAt: now.toISOString(),
          respondBy: "2026-11-17T15:00:00.000Z",
        },
      },
      statusHistory: [{ toStatus: "AWAITING_SHIPPING_QUOTE" }],
    })

    await expect(
      notifyManualQuoteRequested({
        to: "cliente.pf@atelierbureau.test",
        name: "Cliente Pessoa Física",
        orderNumber: order.number,
        reason: "assembly_outside_coverage",
        businessDays: queued.businessDays,
        respondBy: queued.respondBy,
      })
    ).resolves.toBeUndefined()

    await login("comercial@atelierbureau.test")
    const queue = await listManualShippingQuotes()
    expect(queue.success).toBe(true)
    const row = queue.success
      ? queue.orders.find((item) => item.id === order.id)
      : undefined
    expect(row).toMatchObject({
      number: order.number,
      customer: "Cliente Pessoa Física",
      company: null,
      respondBy: "2026-11-17T15:00:00.000Z",
      reason: "assembly_outside_coverage",
      destination: "CEP 70040-010 · Brasília/DF",
      subtotal: "4890.00",
      items: [
        expect.objectContaining({
          skuCode: "MOB-MES-REG-CAR",
          quantity: 1,
          requiresAssembly: true,
        }),
      ],
    })
  })

  it("refuses to queue an order that already left the checkout", async () => {
    const order = await createOrder({
      email: "cliente.pf@atelierbureau.test",
      subtotal: "100.00",
    })
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "PAID" },
    })
    await expect(
      prisma.$transaction((tx) =>
        sendOrderToManualShippingQuote(tx, {
          orderId: order.id,
          reason: "no_option",
          changedById: order.userId,
        })
      )
    ).rejects.toThrow(
      "Este pedido não pode mais seguir para a cotação de frete."
    )
  })

  it("lets the sales team quote the shipping and moves the order to payment", async () => {
    const order = await createOrder({
      email: "cliente.pf@atelierbureau.test",
      subtotal: "4890.00",
    })
    await prisma.$transaction((tx) =>
      sendOrderToManualShippingQuote(tx, {
        orderId: order.id,
        reason: "assembly_outside_coverage",
        changedById: order.userId,
      })
    )
    const answer = {
      orderId: order.id,
      method: "CARRIER" as const,
      carrier: "Transportadora Fictícia",
      service: "Rodoviário com montagem terceirizada",
      price: "350,90",
      deliveryDays: "7",
      note: "Cotado por telefone (teste)",
    }

    await login("cliente.pf@atelierbureau.test")
    expect((await answerManualShippingQuote(answer)).success).toBe(false)
    expect((await listManualShippingQuotes()).success).toBe(false)

    await login("comercial@atelierbureau.test")
    expect(await answerManualShippingQuote(answer)).toEqual({
      success: true,
      status: "AWAITING_PAYMENT",
    })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: {
        status: true,
        shippingTotal: true,
        total: true,
        shipment: {
          select: {
            method: true,
            carrier: true,
            price: true,
            deliveryDays: true,
          },
        },
        statusHistory: {
          select: { toStatus: true },
          orderBy: { createdAt: "asc" },
        },
      },
    })
    expect(stored.status).toBe("AWAITING_PAYMENT")
    expect(stored.shippingTotal.toFixed(2)).toBe("350.90")
    expect(stored.total.toFixed(2)).toBe("5240.90")
    expect(stored.shipment).toMatchObject({
      method: "CARRIER",
      carrier: "Transportadora Fictícia",
      deliveryDays: 7,
    })
    expect(stored.shipment?.price.toFixed(2)).toBe("350.90")
    expect(stored.statusHistory.map((item) => item.toStatus)).toEqual([
      "AWAITING_SHIPPING_QUOTE",
      "AWAITING_PAYMENT",
    ])
    expect(
      await prisma.auditLog.count({
        where: { entityId: order.id, action: "order.shipping_quote.answer" },
      })
    ).toBe(1)

    // A second answer for the same order is refused
    expect(await answerManualShippingQuote(answer)).toEqual({
      success: false,
      error: "Este pedido não está aguardando cotação de frete.",
    })
  })

  it("sends a corporate order above the approval limit to approval (RN01)", async () => {
    const order = await createOrder({
      email: "solicitante@empresa-ficticia.test",
      organizationSlug: "empresa-ficticia",
      subtotal: "9900.00",
    })
    await prisma.$transaction((tx) =>
      sendOrderToManualShippingQuote(tx, {
        orderId: order.id,
        reason: "no_option",
        changedById: order.userId,
      })
    )
    await login("comercial@atelierbureau.test")
    expect(
      await answerManualShippingQuote({
        orderId: order.id,
        method: "OWN_DELIVERY",
        carrier: "Atelier Bureau",
        service: "Entrega própria com montagem",
        price: "200",
        deliveryDays: "",
      })
    ).toEqual({ success: true, status: "AWAITING_APPROVAL" })
    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { requiresApproval: true, total: true },
    })
    expect(stored.requiresApproval).toBe(true)
    expect(stored.total.toFixed(2)).toBe("10100.00")
  })
})

describe("carrier aggregator for large volumes (#42, RF49, RN20)", () => {
  let productId: string
  let skuCode: string

  beforeAll(async () => {
    const category = await prisma.category.findFirstOrThrow({
      select: { id: true },
    })
    const tag = randomUUID().slice(0, 8)
    skuCode = `TST-ARQ-${tag}`
    const product = await prisma.product.create({
      data: {
        categoryId: category.id,
        slug: `teste-arquivo-${tag}`,
        name: `Arquivo de teste ${tag}`,
        description:
          "Produto fictício grande, sem montagem, criado pelo teste.",
        basePrice: "1500.00",
        status: "ACTIVE",
        weightKg: "20.000",
        lengthCm: "120.00",
        widthCm: "60.00",
        heightCm: "10.00",
        requiresInstallation: false,
        skus: { create: { code: skuCode, name: "Único" } },
      },
      select: { id: true },
    })
    productId = product.id
  })

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { id: productId } })
  })

  it("shows carrier, delivery time and price from the aggregator", async () => {
    vi.stubEnv("CARRIER_API_TOKEN", "token-sandbox-ficticio")
    vi.stubEnv("CARRIER_API_BASE_URL", "https://carrier.test")
    const fetcher = vi.fn<
      (url: string, init?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify([
            {
              name: ".Package",
              price: "310.50",
              delivery_time: 7,
              company: { name: "Jadlog" },
            },
            {
              name: "PAC",
              error: "Dimensões acima do limite.",
              company: { name: "Correios" },
            },
          ]),
          { status: 200 }
        )
    )
    vi.stubGlobal("fetch", fetcher)
    const result = await quoteShipping({
      cep: "70040-010",
      items: [{ skuCode, quantity: 1 }],
    })
    expect(result).toEqual({
      success: true,
      quote: {
        status: "quoted",
        strategy: "carrier",
        options: [
          {
            method: "CARRIER",
            carrier: "Jadlog",
            service: ".Package",
            price: "310.50",
            deliveryDays: 7,
          },
        ],
        coverage: { ownDelivery: false, regionName: null },
      },
    })
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))
    expect(body.from.postal_code).toBe("04538133")
    expect(body.products[0]).toMatchObject({ weight: 20, length: 120 })
  })

  it("falls back to the manual quote when the aggregator fails", async () => {
    vi.stubEnv("CARRIER_API_TOKEN", "token-sandbox-ficticio")
    vi.stubEnv("CARRIER_API_BASE_URL", "https://carrier.test")
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    )
    const result = await quoteShipping({
      cep: "70040-010",
      items: [{ skuCode, quantity: 1 }],
    })
    expect(result).toMatchObject({
      success: true,
      quote: {
        status: "manual_quote",
        reason: "no_option",
        responseBusinessDays: 2,
      },
    })
  })
})
