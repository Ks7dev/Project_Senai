import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { jar } from "./next-headers-stub"
import { PDF_BYTES, quoteFixtures } from "./quote-fixtures"

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

const storageDir = await mkdtemp(join(tmpdir(), "atelier-quote-desk-"))
process.env.STORAGE_DIR = storageDir

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { requestQuote } =
  await import("@/features/cart/quote-request/action/quote-request-actions")
const { decideMyQuote, getMyQuote } =
  await import("@/features/cart/customer-quotes/action/customer-quotes-actions")
const {
  answerQuote,
  convertQuoteToOrder,
  downloadAdminQuoteAttachment,
  getAdminQuote,
  listAdminQuotes,
  revalidateQuote,
  startQuoteReview,
} =
  await import("@/features/cart/quote-management/action/quote-management-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = quoteFixtures(prisma)
const sales = "comercial@atelierbureau.test"
const customer = "cliente.pf@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const FORBIDDEN = "Você não tem permissão para esta ação."
const addressIds: string[] = []

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
 * Creates a fictitious delivery address of a seed customer (of the
 * company for corporate members).
 *
 * @param email - Customer e-mail.
 * @returns The address id.
 */
async function createAddress(email: string): Promise<string> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email },
    select: { id: true, members: { select: { organizationId: true } } },
  })
  const organizationId = user.members[0]?.organizationId ?? null
  const address = await prisma.address.create({
    data: {
      userId: organizationId ? null : user.id,
      organizationId,
      label: "Teste de cotação",
      recipient: "Destinatário fictício",
      cep: "01310100",
      street: "Avenida Paulista",
      number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    },
    select: { id: true },
  })
  addressIds.push(address.id)
  return address.id
}

/**
 * Creates a quote of a seed customer with one line of a new product
 * (catalog price R$ 100,00).
 *
 * @param input - Customer, quantity, stock and status.
 * @returns The quote, its line and the SKU.
 */
async function seedQuote(
  input: {
    email?: string
    quantity?: number
    onHand?: number
    status?: "REQUESTED" | "IN_REVIEW" | "ANSWERED" | "ACCEPTED"
    validUntil?: Date
  } = {}
) {
  const sku = await fixtures.createProduct(input.onHand ?? 10)
  const quote = await fixtures.createQuote({
    email: input.email ?? customer,
    sku,
    quantity: input.quantity ?? 3,
    status: input.status,
    validUntil: input.validUntil,
  })
  const item = await prisma.quoteItem.findFirstOrThrow({
    where: { quoteId: quote.id },
    select: { id: true },
  })
  return { ...quote, itemId: item.id, sku }
}

/**
 * Answers a quote as the logged-in sales user: R$ 90,00 per unit,
 * R$ 20,00 of discount and R$ 35,00 of shipping.
 *
 * @param quote - Quote and line ids.
 * @returns The action result.
 */
function answerWithNegotiatedValues(quote: { id: string; itemId: string }) {
  return answerQuote({
    quoteId: quote.id,
    lines: [{ itemId: quote.itemId, unitPrice: "90,00" }],
    discount: "20,00",
    shippingTotal: "35,00",
    note: "Preço especial para o projeto.",
  })
}

/**
 * Conversion input with the usual choices.
 *
 * @param quoteId - Quote id.
 * @param addressId - Delivery address id.
 * @returns The input.
 */
function conversion(quoteId: string, addressId: string) {
  return {
    quoteId,
    addressId,
    paymentMethod: "PIX" as const,
    shippingMethod: "CARRIER" as const,
    carrier: "Transportadora Fictícia",
    deliveryDays: "8",
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.address.deleteMany({ where: { id: { in: addressIds } } })
  await prisma.$disconnect()
  await rm(storageDir, { recursive: true, force: true })
})

describe("sales queue of quotes (#50, RF20)", () => {
  it("lists the quotes with their status and filters them", async () => {
    const open = await seedQuote()
    const expired = await seedQuote({
      status: "ANSWERED",
      validUntil: new Date(Date.now() - 60_000),
    })
    await login(sales)

    const queue = await listAdminQuotes()
    if (!queue.success) throw new Error(queue.error)
    const row = queue.quotes.find((quote) => quote.id === open.id)
    expect(row).toMatchObject({
      number: open.number,
      status: "REQUESTED",
      customer: "Cliente Pessoa Física",
      company: null,
      lines: 1,
      total: "300.00",
    })
    // Past its validity: out of the open queue, listed as expired
    expect(queue.quotes.some((quote) => quote.id === expired.id)).toBe(false)

    const expiredOnly = await listAdminQuotes({ filter: "EXPIRED" })
    if (!expiredOnly.success) throw new Error(expiredOnly.error)
    expect(
      expiredOnly.quotes.find((quote) => quote.id === expired.id)?.status
    ).toBe("EXPIRED")
    expect(expiredOnly.quotes.some((quote) => quote.id === open.id)).toBe(false)

    const answered = await listAdminQuotes({ filter: "ANSWERED" })
    if (!answered.success) throw new Error(answered.error)
    expect(answered.quotes.some((quote) => quote.id === expired.id)).toBe(false)

    const byNumber = await listAdminQuotes({
      filter: "ALL",
      search: open.number,
    })
    if (!byNumber.success) throw new Error(byNumber.error)
    expect(byNumber.quotes.map((quote) => quote.id)).toEqual([open.id])
  })

  it("shows the request with the catalog price and the attachment", async () => {
    const product = await fixtures.createProduct()
    await login(customer)
    const requested = await requestQuote(
      fixtures.requestForm({
        lines: [{ skuId: product.id, quantity: 2 }],
        notes: "Projeto da recepção",
        files: [
          new File([PDF_BYTES], "planta.pdf", { type: "application/pdf" }),
        ],
      })
    )
    if (!requested.success) throw new Error(requested.error)

    await login(sales)
    const detail = await getAdminQuote({ quoteId: requested.quote.quoteId })
    if (!detail.success) throw new Error(detail.error)
    expect(detail.quote).toMatchObject({
      number: requested.quote.number,
      status: "REQUESTED",
      notes: "Projeto da recepção",
      customerEmail: customer,
      order: null,
    })
    expect(detail.quote.items[0]).toMatchObject({
      skuCode: product.code,
      quantity: 2,
      unitPrice: "100.00",
      catalogPrice: "100.00",
    })
    const file = await downloadAdminQuoteAttachment({
      attachmentId: detail.quote.attachments[0].id,
    })
    if (!file.success) throw new Error(file.error)
    expect(Buffer.from(file.file.data, "base64")).toEqual(PDF_BYTES)
  })

  it("refuses customers and visitors in every back office action", async () => {
    const quote = await seedQuote({ status: "ACCEPTED" })
    const addressId = await createAddress(customer)
    await login(customer)
    const denied = { success: false, error: FORBIDDEN }
    expect(await listAdminQuotes()).toEqual(denied)
    expect(await getAdminQuote({ quoteId: quote.id })).toEqual(denied)
    expect(await startQuoteReview({ quoteId: quote.id })).toEqual(denied)
    expect(await answerWithNegotiatedValues(quote)).toEqual(denied)
    expect(await revalidateQuote({ quoteId: quote.id })).toEqual(denied)
    expect(await convertQuoteToOrder(conversion(quote.id, addressId))).toEqual(
      denied
    )
    jar.clear()
    expect(await listAdminQuotes()).toEqual({
      success: false,
      error: "Entre na sua conta para continuar.",
    })
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(0)
  })
})

describe("answering a quote (#50, RF20)", () => {
  it("takes the quote for analysis and answers with the negotiated values", async () => {
    const quote = await seedQuote()
    await login(sales)
    expect(await startQuoteReview({ quoteId: quote.id })).toEqual({
      success: true,
    })
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status
    ).toBe("IN_REVIEW")

    const before = Date.now()
    const answer = await answerWithNegotiatedValues(quote)
    if (!answer.success) throw new Error(answer.error)
    expect(answer.total).toBe("285.00")

    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      include: { items: true, answeredBy: { select: { email: true } } },
    })
    expect(saved.status).toBe("ANSWERED")
    expect(saved.items[0].unitPrice?.toFixed(2)).toBe("90.00")
    expect(saved.subtotal.toFixed(2)).toBe("270.00")
    expect(saved.discount.toFixed(2)).toBe("20.00")
    expect(saved.shippingTotal.toFixed(2)).toBe("35.00")
    expect(saved.total.toFixed(2)).toBe("285.00")
    expect(saved.answerNote).toBe("Preço especial para o projeto.")
    expect(saved.answeredBy?.email).toBe(sales)
    expect(saved.validUntil!.getTime()).toBeGreaterThanOrEqual(
      before + 15 * 24 * 60 * 60 * 1000
    )
    expect(
      await prisma.emailOutbox.count({
        where: { subject: `Cotação ${quote.number} respondida` },
      })
    ).toBe(1)
    expect(
      await prisma.auditLog.count({
        where: { action: "quote.answer", entityId: quote.id },
      })
    ).toBe(1)

    await login(customer)
    const mine = await getMyQuote({ quoteId: quote.id })
    if (!mine.success) throw new Error(mine.error)
    expect(mine.quote).toMatchObject({
      status: "ANSWERED",
      canDecide: true,
      answerNote: "Preço especial para o projeto.",
      total: "285.00",
    })
  })

  it("refuses a discount above the items, missing lines and an accepted quote", async () => {
    const quote = await seedQuote()
    await login(sales)
    expect(
      await answerQuote({
        quoteId: quote.id,
        lines: [{ itemId: quote.itemId, unitPrice: "90" }],
        discount: "270,01",
        shippingTotal: "0",
      })
    ).toEqual({
      success: false,
      error: "O desconto não pode ser maior que a soma dos itens.",
    })
    expect(
      await answerQuote({
        quoteId: quote.id,
        lines: [
          { itemId: "0190f5a0-0000-7000-8000-00000000dead", unitPrice: "90" },
        ],
        discount: "0",
        shippingTotal: "0",
      })
    ).toEqual({
      success: false,
      error: "Informe o preço de todos os itens da cotação.",
    })
    const accepted = await seedQuote({ status: "ACCEPTED" })
    expect(await answerWithNegotiatedValues(accepted)).toMatchObject({
      success: false,
    })
    const untouched = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      select: { status: true, total: true },
    })
    expect(untouched.status).toBe("REQUESTED")
    expect(untouched.total.toFixed(2)).toBe("300.00")
  })

  it("demands the revalidation before answering an expired quote", async () => {
    const quote = await seedQuote({
      status: "ANSWERED",
      validUntil: new Date(Date.now() - 60_000),
    })
    await login(sales)
    expect(await answerWithNegotiatedValues(quote)).toEqual({
      success: false,
      error:
        "A validade desta cotação terminou. Revalide os preços para continuar.",
    })
    const revalidated = await revalidateQuote({ quoteId: quote.id })
    if (!revalidated.success) throw new Error(revalidated.error)
    expect(revalidated.total).toBe("300.00")
    expect(await answerWithNegotiatedValues(quote)).toMatchObject({
      success: true,
    })
  })
})

describe("customer decision (#50, RF20)", () => {
  it("accepts only an answered quote of the customer", async () => {
    const quote = await seedQuote()
    await login(customer)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "accept" })
    ).toEqual({
      success: false,
      error: "Esta cotação não está aguardando a sua aprovação.",
    })
    await login(sales)
    expect(await answerWithNegotiatedValues(quote)).toMatchObject({
      success: true,
    })
    await login(requester)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "accept" })
    ).toEqual({ success: false, error: "Cotação não encontrada." })
    await login(customer)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "accept" })
    ).toEqual({ success: true, status: "ACCEPTED" })
    expect(
      await prisma.auditLog.count({
        where: { action: "quote.accept", entityId: quote.id },
      })
    ).toBe(1)
  })

  it("lets the customer refuse, and a refused quote never becomes an order", async () => {
    const quote = await seedQuote({ status: "ANSWERED" })
    const addressId = await createAddress(customer)
    await login(customer)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "reject" })
    ).toEqual({ success: true, status: "REJECTED" })
    await login(sales)
    expect(await convertQuoteToOrder(conversion(quote.id, addressId))).toEqual({
      success: false,
      error: "Só uma cotação aprovada pelo cliente pode virar pedido.",
    })
  })

  it("refuses the approval of an expired proposal", async () => {
    const quote = await seedQuote({
      status: "ANSWERED",
      validUntil: new Date(Date.now() - 60_000),
    })
    await login(customer)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "accept" })
    ).toEqual({
      success: false,
      error:
        "A validade desta cotação terminou. Revalide os preços para continuar.",
    })
  })
})

describe("converting a quote into an order (#50, RF20)", () => {
  it("keeps the negotiated values even after the catalog price changes", async () => {
    const quote = await seedQuote({ quantity: 3, onHand: 10 })
    const addressId = await createAddress(customer)
    await login(sales)
    expect(await answerWithNegotiatedValues(quote)).toMatchObject({
      success: true,
    })
    await login(customer)
    expect(
      await decideMyQuote({ quoteId: quote.id, decision: "accept" })
    ).toMatchObject({ success: true })
    // The catalog moves after the negotiation
    await prisma.sku.update({
      where: { id: quote.sku.id },
      data: { price: "150.00" },
    })

    await login(sales)
    const result = await convertQuoteToOrder(conversion(quote.id, addressId))
    if (!result.success) throw new Error(result.error)
    expect(result.order).toMatchObject({
      status: "AWAITING_PAYMENT",
      total: "285.00",
    })
    expect(result.order.number).toMatch(/^AB-\d{4}-\d{6}$/)

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.order.orderId },
      include: {
        items: true,
        shipment: true,
        statusHistory: true,
        user: { select: { email: true } },
      },
    })
    expect(order.quoteId).toBe(quote.id)
    expect(order.user.email).toBe(customer)
    expect(order.paymentMethod).toBe("PIX")
    expect(order.subtotal.toFixed(2)).toBe("270.00")
    expect(order.discount.toFixed(2)).toBe("20.00")
    expect(order.shippingTotal.toFixed(2)).toBe("35.00")
    expect(order.servicesTotal.toFixed(2)).toBe("0.00")
    expect(order.total.toFixed(2)).toBe("285.00")
    expect(order.requiresApproval).toBe(false)
    expect(order.items).toHaveLength(1)
    expect(order.items[0]).toMatchObject({
      skuId: quote.sku.id,
      skuCode: quote.sku.code,
      quantity: 3,
    })
    expect(order.items[0].unitPrice.toFixed(2)).toBe("90.00")
    expect(order.items[0].total.toFixed(2)).toBe("270.00")
    expect(order.shippingAddress).toMatchObject({
      addressId,
      cep: "01310100",
      city: "São Paulo",
    })
    expect(order.shipment).toMatchObject({
      method: "CARRIER",
      carrier: "Transportadora Fictícia",
      deliveryDays: 8,
    })
    expect(order.shipment?.price.toFixed(2)).toBe("35.00")
    expect(order.statusHistory[0].note).toBe(
      `Pedido gerado a partir da cotação ${quote.number}.`
    )

    // Stock reserved in the same transaction
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { skuId: quote.sku.id },
    })
    expect(stock).toMatchObject({ onHand: 10, reserved: 3 })
    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.id },
      select: { status: true, total: true },
    })
    expect(saved.status).toBe("CONVERTED")
    expect(saved.total.toFixed(2)).toBe("285.00")
    expect(
      await prisma.auditLog.count({
        where: { action: "quote.convert", entityId: quote.id },
      })
    ).toBe(1)

    // Converts only once
    expect(await convertQuoteToOrder(conversion(quote.id, addressId))).toEqual({
      success: false,
      error: "Esta cotação já foi convertida em pedido.",
    })
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(1)

    const detail = await getAdminQuote({ quoteId: quote.id })
    if (!detail.success) throw new Error(detail.error)
    expect(detail.quote.order).toEqual({
      id: result.order.orderId,
      number: result.order.number,
    })
    await login(customer)
    const mine = await getMyQuote({ quoteId: quote.id })
    if (!mine.success) throw new Error(mine.error)
    expect(mine.quote.order?.number).toBe(result.order.number)
  })

  it("sends a corporate order above the limit to the company approval", async () => {
    const quote = await seedQuote({
      email: requester,
      quantity: 120,
      onHand: 200,
      status: "ACCEPTED",
    })
    const addressId = await createAddress(requester)
    await login(sales)
    const result = await convertQuoteToOrder(conversion(quote.id, addressId))
    if (!result.success) throw new Error(result.error)
    expect(result.order).toMatchObject({
      status: "AWAITING_APPROVAL",
      total: "12000.00",
    })
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.order.orderId },
      select: { requiresApproval: true, organizationId: true },
    })
    expect(order.requiresApproval).toBe(true)
    expect(order.organizationId).not.toBeNull()
  })

  it("refuses a quote not accepted, an expired one and a foreign address", async () => {
    const addressId = await createAddress(customer)
    const foreign = await createAddress(requester)
    await login(sales)

    const answered = await seedQuote({ status: "ANSWERED" })
    expect(
      await convertQuoteToOrder(conversion(answered.id, addressId))
    ).toEqual({
      success: false,
      error: "Só uma cotação aprovada pelo cliente pode virar pedido.",
    })

    const expired = await seedQuote({
      status: "ACCEPTED",
      validUntil: new Date(Date.now() - 60_000),
    })
    expect(
      await convertQuoteToOrder(conversion(expired.id, addressId))
    ).toEqual({
      success: false,
      error:
        "A validade desta cotação terminou. Revalide os preços para continuar.",
    })

    const accepted = await seedQuote({ status: "ACCEPTED" })
    expect(await convertQuoteToOrder(conversion(accepted.id, foreign))).toEqual(
      {
        success: false,
        error: "Escolha um dos endereços cadastrados pelo cliente.",
      }
    )
    expect(
      await prisma.order.count({
        where: { quoteId: { in: [answered.id, expired.id, accepted.id] } },
      })
    ).toBe(0)
  })

  it("rolls everything back when the stock is not enough", async () => {
    const quote = await seedQuote({
      quantity: 5,
      onHand: 2,
      status: "ACCEPTED",
    })
    const addressId = await createAddress(customer)
    await login(sales)
    const result = await convertQuoteToOrder(conversion(quote.id, addressId))
    expect(result.success).toBe(false)
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(0)
    const stock = await prisma.stock.findUniqueOrThrow({
      where: { skuId: quote.sku.id },
    })
    expect(stock.reserved).toBe(0)
    expect(
      (await prisma.quote.findUniqueOrThrow({ where: { id: quote.id } })).status
    ).toBe("ACCEPTED")
  })

  it("demands a valid installation date when an item needs installation", async () => {
    const quote = await seedQuote({ status: "ACCEPTED" })
    await prisma.product.updateMany({
      where: { skus: { some: { id: quote.sku.id } } },
      data: { requiresInstallation: true },
    })
    const addressId = await createAddress(customer)
    await login(sales)
    expect(await convertQuoteToOrder(conversion(quote.id, addressId))).toEqual({
      success: false,
      error: "Informe a data de entrega e instalação combinada com o cliente.",
    })
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const tooEarly = await convertQuoteToOrder({
      ...conversion(quote.id, addressId),
      installationDate: yesterday,
    })
    expect(tooEarly.success).toBe(false)
    expect(await prisma.order.count({ where: { quoteId: quote.id } })).toBe(0)
  })
})
