import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"
import { randomUUID } from "node:crypto"
import { resetInternalTwoFactor, signInSeedAccount } from "./internal-sign-in"
import { jar } from "./next-headers-stub"
import { deleteOrders, orderFixtures } from "./order-fixtures"

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
const { reserveStock } =
  await import("@/features/shared/lib/stock/stock-service")
const { loadCreditPosition } =
  await import("@/features/shared/lib/credit/credit-service")
const { creditExceededMessage } =
  await import("@/features/shared/lib/credit/credit-math")
const { confirmInvoicedOrder, settleInstallment } =
  await import("@/features/finance/invoiced-billing/action/invoiced-billing-actions")
const { updateCorporateCredit } =
  await import("@/features/finance/credit-approval/action/credit-approval-actions")
const { addToCart } = await import("@/features/shared/lib/cart/cart-actions")
const { resetCorreiosToken } =
  await import("@/features/shared/lib/correios/correios")
const { placeOrder, quoteCheckoutShipping } =
  await import("@/features/payment/checkout/action/checkout-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = orderFixtures(prisma)
const finance = "financeiro@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const seedOrganizationSlug = "empresa-ficticia"
const DAY_MS = 24 * 60 * 60 * 1000
const organizations: string[] = []
const addresses: string[] = []
const placedOrders: string[] = []

/**
 * Creates a fictitious corporate account of the test, so the credit of
 * the seed account is never touched.
 *
 * @param credit - Credit status and limit.
 * @returns The account id and slug.
 */
async function createOrganization(credit: {
  status: "NONE" | "PENDING" | "APPROVED" | "REJECTED"
  limit: string | null
}) {
  const tag = randomUUID().slice(0, 8)
  const organization = await prisma.organization.create({
    data: {
      id: randomUUID(),
      name: `Empresa de teste ${tag}`,
      slug: `teste-credito-${tag}`,
      creditStatus: credit.status,
      creditLimit: credit.limit,
      createdAt: new Date(),
    },
    select: { id: true, slug: true },
  })
  organizations.push(organization.id)
  return organization
}

/**
 * Creates an invoiced order of R$ 100,00 waiting for the finance
 * confirmation, with one reserved unit of a fresh SKU.
 *
 * @param organizationSlug - Corporate account of the order.
 * @returns The order and the SKU.
 */
async function awaitingInvoicedOrder(organizationSlug: string) {
  const sku = await fixtures.createSku(3)
  const order = await fixtures.createOrder({
    email: requester,
    organizationSlug,
    status: "AWAITING_PAYMENT",
    paymentMethod: "INVOICED",
    sku,
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
 * Today in the São Paulo calendar, as the settlement form sends it.
 *
 * @param offsetDays - Days added to today.
 * @returns The date, YYYY-MM-DD.
 */
function saoPauloDate(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * DAY_MS).toLocaleDateString(
    "en-CA",
    { timeZone: "America/Sao_Paulo" }
  )
}

/** Fake Correios: PAC R$ 45,90 and SEDEX R$ 88,10. */
function stubCorreios() {
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
          ? { pcFinal: isSedex ? "88,10" : "45,90" }
          : { prazoEntrega: isSedex ? 3 : 8 }
      return new Response(JSON.stringify(body), { status: 200 })
    })
  )
}

/**
 * Logs in as the seed requester, fills the cart with one unit of a
 * sellable SKU at the given price and quotes PAC to an address of the
 * company.
 *
 * @param price - Unit price of the SKU.
 * @returns The SKU, the address and the PAC option.
 */
async function corporateCheckout(price: string) {
  const sku = await fixtures.createSku(5)
  await prisma.sku.update({
    where: { id: sku.id },
    data: {
      price,
      product: { update: { status: "ACTIVE", basePrice: price } },
    },
  })
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { slug: seedOrganizationSlug },
    select: { id: true },
  })
  const address = await prisma.address.create({
    data: {
      organizationId: organization.id,
      label: "Filial (teste)",
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
  await signInSeedAccount(requester, password)
  await prisma.cartItem.deleteMany({
    where: { cart: { user: { email: requester }, kind: "CART" } },
  })
  stubCorreios()
  expect(await addToCart({ skuCode: sku.code, quantity: 1 })).toMatchObject({
    success: true,
  })
  const quote = await quoteCheckoutShipping({ addressId: address.id })
  if (!quote.success || quote.quote.status !== "quoted") {
    throw new Error("quote failed")
  }
  const pac = quote.quote.options.find((option) => option.service === "PAC")!
  return { sku, addressId: address.id, pac, organizationId: organization.id }
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
  await deleteOrders(prisma, placedOrders)
  await prisma.cartItem.deleteMany({
    where: { cart: { user: { email: requester }, kind: "CART" } },
  })
  await prisma.address.deleteMany({ where: { id: { in: addresses } } })
  await fixtures.cleanup()
  await prisma.organization.deleteMany({
    where: { id: { in: organizations } },
  })
  await resetInternalTwoFactor()
  await prisma.$disconnect()
})

describe("invoiced orders confirmed by the finance team (#60, RF33, RN03)", () => {
  it("confirms an invoiced order with installments due in 28 and 56 days", async () => {
    const organization = await createOrganization({
      status: "APPROVED",
      limit: "1000.00",
    })
    const { order, sku } = await awaitingInvoicedOrder(organization.slug)
    const financeId = await userId(finance)
    await signInSeedAccount(finance, password)
    const before = Date.now()

    expect(await confirmInvoicedOrder({ orderId: order.id })).toEqual({
      success: true,
      number: order.number,
    })

    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      })
    ).toEqual({ status: "PAID" })
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 2, reserved: 0 })

    const installments = await prisma.receivable.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
      select: {
        sequence: true,
        dueDays: true,
        amount: true,
        dueDate: true,
        status: true,
        boletoNumber: true,
        digitableLine: true,
      },
    })
    expect(installments.map((row) => [row.sequence, row.dueDays])).toEqual([
      [1, 28],
      [2, 56],
    ])
    expect(installments.map((row) => row.amount.toFixed(2))).toEqual([
      "50.00",
      "50.00",
    ])
    for (const row of installments) {
      expect(row.status).toBe("OPEN")
      expect(row.boletoNumber).not.toBe("")
      expect(row.digitableLine).not.toBe("")
      // End of the due day in São Paulo: between the day count and one
      // more day after the confirmation
      const days = (row.dueDate.getTime() - before) / DAY_MS
      expect(days).toBeGreaterThan(row.dueDays - 1)
      expect(days).toBeLessThan(row.dueDays + 2)
    }

    expect(
      await prisma.auditLog.findFirst({
        where: { action: "order.invoiced_confirm", entityId: order.id },
        select: { userId: true, after: true },
      })
    ).toEqual({
      userId: financeId,
      after: { status: "PAID", total: "100.00" },
    })
    expect(
      await prisma.emailOutbox.count({
        where: {
          template: "order.invoiced_installments",
          subject: { contains: order.number },
        },
      })
    ).toBe(1)

    // Confirmed only once
    expect(await confirmInvoicedOrder({ orderId: order.id })).toEqual({
      success: false,
      error:
        "Este pedido não aguarda a confirmação do financeiro. Atualize a página.",
    })
    expect(
      await prisma.receivable.count({ where: { orderId: order.id } })
    ).toBe(2)
  })

  it("does not confirm an invoiced order above the available credit", async () => {
    const organization = await createOrganization({
      status: "APPROVED",
      limit: "50.00",
    })
    const { order, sku } = await awaitingInvoicedOrder(organization.slug)
    await signInSeedAccount(finance, password)

    expect(await confirmInvoicedOrder({ orderId: order.id })).toEqual({
      success: false,
      error: creditExceededMessage("50.00"),
    })
    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
        select: { status: true },
      })
    ).toEqual({ status: "AWAITING_PAYMENT" })
    expect(
      await prisma.receivable.count({ where: { orderId: order.id } })
    ).toBe(0)
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 3, reserved: 1 })
  })

  it("settles an installment, gives the credit back and refuses invalid settlements", async () => {
    const organization = await createOrganization({
      status: "APPROVED",
      limit: "1000.00",
    })
    const { order } = await awaitingInvoicedOrder(organization.slug)
    const financeId = await userId(finance)
    await signInSeedAccount(finance, password)
    expect(await confirmInvoicedOrder({ orderId: order.id })).toMatchObject({
      success: true,
    })
    const [first, second] = await prisma.receivable.findMany({
      where: { orderId: order.id },
      orderBy: { sequence: "asc" },
      select: { id: true },
    })
    expect((await loadCreditPosition(prisma, organization.id)).used).toBe(
      "100.00"
    )

    const today = saoPauloDate()
    expect(
      await settleInstallment({
        installmentId: first.id,
        paidAt: today,
        paidAmount: "50,00",
        method: "BANK_RETURN",
        note: "Retorno bancário fictício.",
      })
    ).toEqual({ success: true, orderNumber: order.number, sequence: 1 })

    const settled = await prisma.receivable.findUniqueOrThrow({
      where: { id: first.id },
      select: {
        status: true,
        paidAt: true,
        paidAmount: true,
        settledById: true,
        settlementMethod: true,
        settlementNote: true,
      },
    })
    expect(settled).toMatchObject({
      status: "PAID",
      settledById: financeId,
      settlementMethod: "BANK_RETURN",
      settlementNote: "Retorno bancário fictício.",
    })
    expect(settled.paidAmount?.toFixed(2)).toBe("50.00")
    expect(settled.paidAt?.toISOString()).toBe(
      new Date(`${today}T12:00:00-03:00`).toISOString()
    )
    expect(
      await prisma.auditLog.count({
        where: { action: "installment.settle", entityId: first.id },
      })
    ).toBe(1)
    expect(
      await prisma.receivable.findUniqueOrThrow({
        where: { id: second.id },
        select: { status: true },
      })
    ).toEqual({ status: "OPEN" })
    // The settled installment gives the credit back (RN10)
    expect((await loadCreditPosition(prisma, organization.id)).used).toBe(
      "50.00"
    )

    expect(
      await settleInstallment({
        installmentId: first.id,
        paidAt: today,
        paidAmount: "50.00",
        method: "MANUAL",
      })
    ).toEqual({ success: false, error: "Esta parcela já foi baixada." })
    expect(
      await settleInstallment({
        installmentId: second.id,
        paidAt: today,
        paidAmount: "10.00",
        method: "MANUAL",
      })
    ).toEqual({
      success: false,
      // Intl formats the amount with a non-breaking space after "R$"
      error: expect.stringMatching(
        /^O valor pago é menor que o da parcela \(R\$\s50,00\)\. Baixa parcial não é aceita\.$/
      ),
    })
    expect(
      await settleInstallment({
        installmentId: second.id,
        paidAt: saoPauloDate(3),
        paidAmount: "50.00",
        method: "MANUAL",
      })
    ).toEqual({
      success: false,
      error: "A data do pagamento não pode estar no futuro.",
    })
    expect(
      await prisma.receivable.findUniqueOrThrow({
        where: { id: second.id },
        select: { status: true },
      })
    ).toEqual({ status: "OPEN" })
  })
})

describe("credit limit of corporate accounts (#58, RF58, RN10)", () => {
  it("approves the credit with a limit, keeps the history and the audit log", async () => {
    const organization = await createOrganization({
      status: "PENDING",
      limit: null,
    })
    const financeId = await userId(finance)
    await signInSeedAccount(finance, password)

    const result = await updateCorporateCredit({
      organizationId: organization.id,
      status: "APPROVED",
      limit: "1500,00",
      note: "Análise de crédito fictícia aprovada.",
    })
    if (!result.success) throw new Error(result.error)
    expect(result.credit).toMatchObject({
      status: "APPROVED",
      limit: "1500.00",
      used: "0.00",
      available: "1500.00",
    })

    expect(
      await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
        select: { creditStatus: true, creditLimit: true },
      })
    ).toMatchObject({ creditStatus: "APPROVED" })
    const changes = await prisma.creditLimitChange.findMany({
      where: { organizationId: organization.id },
      select: {
        id: true,
        previousStatus: true,
        status: true,
        previousLimit: true,
        newLimit: true,
        changedById: true,
        note: true,
      },
    })
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({
      previousStatus: "PENDING",
      status: "APPROVED",
      previousLimit: null,
      changedById: financeId,
      note: "Análise de crédito fictícia aprovada.",
    })
    expect(changes[0].newLimit?.toFixed(2)).toBe("1500.00")
    expect(
      await prisma.auditLog.findFirst({
        where: { action: "credit.update", entityId: organization.id },
        select: { userId: true, before: true, after: true },
      })
    ).toEqual({
      userId: financeId,
      before: { creditStatus: "PENDING", creditLimit: null },
      after: {
        creditStatus: "APPROVED",
        creditLimit: "1500.00",
        changeId: changes[0].id,
        note: "Análise de crédito fictícia aprovada.",
      },
    })

    expect(
      await updateCorporateCredit({
        organizationId: organization.id,
        status: "APPROVED",
        limit: "1500",
      })
    ).toEqual({
      success: false,
      error: "Nada mudou: a conta já está com esta situação e este limite.",
    })
    expect(
      await updateCorporateCredit({
        organizationId: organization.id,
        status: "REJECTED",
        note: "curta",
      })
    ).toEqual({
      success: false,
      error: "Explique o motivo da recusa (mínimo de 10 caracteres).",
    })
    expect(
      await prisma.creditLimitChange.count({
        where: { organizationId: organization.id },
      })
    ).toBe(1)
  })

  it("lowering the limit below an order blocks its invoiced confirmation", async () => {
    const organization = await createOrganization({
      status: "APPROVED",
      limit: "1000.00",
    })
    const { order } = await awaitingInvoicedOrder(organization.slug)
    await signInSeedAccount(finance, password)

    const lowered = await updateCorporateCredit({
      organizationId: organization.id,
      status: "APPROVED",
      limit: "60,00",
      note: "Redução de limite por inadimplência fictícia.",
    })
    if (!lowered.success) throw new Error(lowered.error)
    // The waiting order already holds the credit
    expect(lowered.credit).toMatchObject({
      limit: "60.00",
      used: "100.00",
      available: "0.00",
    })

    expect(await confirmInvoicedOrder({ orderId: order.id })).toEqual({
      success: false,
      error: creditExceededMessage("60.00"),
    })

    expect(
      await updateCorporateCredit({
        organizationId: organization.id,
        status: "APPROVED",
        limit: "100.00",
        note: "Limite restabelecido.",
      })
    ).toMatchObject({ success: true })
    expect(await confirmInvoicedOrder({ orderId: order.id })).toEqual({
      success: true,
      number: order.number,
    })
    expect(
      await prisma.creditLimitChange.count({
        where: { organizationId: organization.id },
      })
    ).toBe(2)
  })

  it("refuses the credit change to users without the finance permission", async () => {
    const organization = await createOrganization({
      status: "PENDING",
      limit: null,
    })
    await signInSeedAccount(requester, password)
    const result = await updateCorporateCredit({
      organizationId: organization.id,
      status: "APPROVED",
      limit: "999999.00",
    })
    expect(result.success).toBe(false)

    jar.clear()
    expect(
      (
        await updateCorporateCredit({
          organizationId: organization.id,
          status: "APPROVED",
          limit: "999999.00",
        })
      ).success
    ).toBe(false)
    expect(
      await prisma.organization.findUniqueOrThrow({
        where: { id: organization.id },
        select: { creditStatus: true, creditLimit: true },
      })
    ).toEqual({ creditStatus: "PENDING", creditLimit: null })
  })
})

describe("invoiced checkout and the credit limit (RN10)", () => {
  it("blocks an invoiced order above the available credit at checkout", async () => {
    const seed = await prisma.organization.findUniqueOrThrow({
      where: { slug: seedOrganizationSlug },
      select: { id: true },
    })
    const position = await loadCreditPosition(prisma, seed.id)
    expect(position.canBuyInvoiced).toBe(true)
    // Twice the available credit: above it even with the price table
    const price = (Number(position.available) * 2 + 1000).toFixed(2)
    const { sku, addressId, pac } = await corporateCheckout(price)

    const result = await placeOrder({
      addressId,
      option: { method: "CORREIOS_PAC", carrier: pac.carrier, service: "PAC" },
      expectedShippingPrice: pac.price,
      expectedTotal: pac.total,
      paymentMethod: "INVOICED",
    })
    expect(result).toEqual({
      success: false,
      error: creditExceededMessage(position.available),
    })
    expect(await prisma.orderItem.count({ where: { skuId: sku.id } })).toBe(0)
    expect(await fixtures.counters(sku.id)).toEqual({ onHand: 5, reserved: 0 })
  })

  it("confirms an invoiced order within the credit at once with its installments", async () => {
    const { addressId, pac } = await corporateCheckout("100.00")

    const result = await placeOrder({
      addressId,
      option: { method: "CORREIOS_PAC", carrier: pac.carrier, service: "PAC" },
      expectedShippingPrice: pac.price,
      expectedTotal: pac.total,
      paymentMethod: "INVOICED",
    })
    if (!result.success) throw new Error(result.error)
    placedOrders.push(result.order.orderId)

    expect(
      await prisma.order.findUniqueOrThrow({
        where: { id: result.order.orderId },
        select: { status: true, paymentMethod: true },
      })
    ).toEqual({ status: "PAID", paymentMethod: "INVOICED" })
    const installments = await prisma.receivable.findMany({
      where: { orderId: result.order.orderId },
      orderBy: { sequence: "asc" },
      select: { dueDays: true, amount: true },
    })
    expect(installments.map((row) => row.dueDays)).toEqual([28, 56])
    const sum = installments.reduce(
      (total, row) => total + Math.round(Number(row.amount) * 100),
      0
    )
    expect((sum / 100).toFixed(2)).toBe(pac.total)
  })
})
