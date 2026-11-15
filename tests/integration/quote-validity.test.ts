import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { jar } from "./next-headers-stub"
import { quoteFixtures } from "./quote-fixtures"

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
const { requestQuote } =
  await import("@/features/cart/quote-request/action/quote-request-actions")
const { getMyQuote, listMyQuotes, revalidateMyQuote } =
  await import("@/features/cart/customer-quotes/action/customer-quotes-actions")
const { expireQuotes, loadQuoteValidityDays } =
  await import("@/features/shared/lib/quotes/quote-expiration")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = quoteFixtures(prisma)
const customer = "cliente.pf@atelierbureau.test"
const requester = "solicitante@empresa-ficticia.test"
const DAY_MS = 24 * 60 * 60 * 1000

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
 * Requests a quote of one test product as the logged-in customer.
 *
 * @param quantity - Units asked.
 * @returns The quote id and number, and the SKU.
 */
async function requestTestQuote(quantity = 2) {
  const product = await fixtures.createProduct()
  const result = await requestQuote(
    fixtures.requestForm({ lines: [{ skuId: product.id, quantity }] })
  )
  if (!result.success) throw new Error(result.error)
  return { ...result.quote, sku: product }
}

/**
 * Creates a valid quote of the PF customer straight in the database
 * (the request action is rate limited).
 *
 * @param quantity - Units asked.
 * @returns The quote id and number, and the SKU.
 */
async function seedQuote(quantity = 2) {
  const sku = await fixtures.createProduct()
  const quote = await fixtures.createQuote({ email: customer, sku, quantity })
  return { quoteId: quote.id, number: quote.number, sku }
}

/**
 * Moves the validity of a quote to the past, as if the days had gone by.
 *
 * @param quoteId - Quote id.
 * @param data - Extra fields to set (negotiated values, status).
 */
async function letExpire(
  quoteId: string,
  data: {
    status?: "ANSWERED" | "CONVERTED"
    discount?: string
    shippingTotal?: string
    total?: string
  } = {}
) {
  await prisma.quote.update({
    where: { id: quoteId },
    data: { ...data, validUntil: new Date(Date.now() - 60_000) },
  })
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
})

describe("quote number and validity (#49, RF06, RN02)", () => {
  it("numbers each quote uniquely and in sequence", async () => {
    await login(customer)
    const first = await requestTestQuote()
    const second = await requestTestQuote()
    expect(first.number).toMatch(/^COT-\d{4}-\d{6}$/)
    expect(second.number).not.toBe(first.number)
    expect(Number(second.number.slice(-6))).toBeGreaterThan(
      Number(first.number.slice(-6))
    )
    expect(await prisma.quote.count({ where: { number: first.number } })).toBe(
      1
    )
  })

  it("gives the quote the configured validity from the request", async () => {
    await login(customer)
    const quote = await requestTestQuote()
    const days = await loadQuoteValidityDays()
    expect(days).toBe(15)
    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.quoteId },
      select: { createdAt: true, validUntil: true },
    })
    expect(saved.validUntil?.getTime()).toBe(
      saved.createdAt.getTime() + days * DAY_MS
    )
  })

  it("shows a quote past its validity as expired and the job marks it", async () => {
    await login(customer)
    const quote = await seedQuote()
    const valid = await getMyQuote({ quoteId: quote.quoteId })
    if (!valid.success) throw new Error(valid.error)
    expect(valid.quote).toMatchObject({
      status: "REQUESTED",
      canRevalidate: false,
    })

    await letExpire(quote.quoteId)
    const detail = await getMyQuote({ quoteId: quote.quoteId })
    if (!detail.success) throw new Error(detail.error)
    expect(detail.quote).toMatchObject({
      status: "EXPIRED",
      canRevalidate: true,
    })
    const list = await listMyQuotes()
    if (!list.success) throw new Error(list.error)
    expect(list.quotes.find((row) => row.id === quote.quoteId)?.status).toBe(
      "EXPIRED"
    )

    expect(await expireQuotes()).toBeGreaterThanOrEqual(1)
    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.quoteId },
      select: { status: true },
    })
    expect(saved.status).toBe("EXPIRED")
    expect(
      await prisma.auditLog.count({
        where: { action: "quote.expire", entityId: quote.quoteId },
      })
    ).toBe(1)
    // A second sweep finds nothing left for this quote
    await expireQuotes()
    expect(
      await prisma.auditLog.count({
        where: { action: "quote.expire", entityId: quote.quoteId },
      })
    ).toBe(1)
  })

  it("keeps valid and converted quotes out of the expiration", async () => {
    await login(customer)
    const valid = await seedQuote()
    const converted = await seedQuote()
    await letExpire(converted.quoteId, { status: "CONVERTED" })
    await expireQuotes()
    const rows = await prisma.quote.findMany({
      where: { id: { in: [valid.quoteId, converted.quoteId] } },
      select: { id: true, status: true },
    })
    expect(rows.find((row) => row.id === valid.quoteId)?.status).toBe(
      "REQUESTED"
    )
    expect(rows.find((row) => row.id === converted.quoteId)?.status).toBe(
      "CONVERTED"
    )
  })

  it("refuses the revalidation of a quote still valid", async () => {
    await login(customer)
    const quote = await seedQuote()
    expect(await revalidateMyQuote({ quoteId: quote.quoteId })).toEqual({
      success: false,
      error: "Esta cotação não está vencida; os preços continuam válidos.",
    })
  })

  it("revalidates an expired quote with the current catalog prices", async () => {
    await login(customer)
    const quote = await seedQuote(3)
    // Answered with a discount and shipping, then left to expire
    await letExpire(quote.quoteId, {
      status: "ANSWERED",
      discount: "30.00",
      shippingTotal: "50.00",
      total: "320.00",
    })
    await expireQuotes()
    // The catalog price changed in the meantime
    await prisma.sku.update({
      where: { id: quote.sku.id },
      data: { price: "120.00" },
    })

    const before = Date.now()
    const result = await revalidateMyQuote({ quoteId: quote.quoteId })
    if (!result.success) throw new Error(result.error)
    expect(result.total).toBe("360.00")

    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.quoteId },
      include: { items: true },
    })
    expect(saved.status).toBe("REQUESTED")
    expect(saved.items[0].unitPrice?.toFixed(2)).toBe("120.00")
    expect(saved.subtotal.toFixed(2)).toBe("360.00")
    expect(saved.discount.toFixed(2)).toBe("0.00")
    expect(saved.shippingTotal.toFixed(2)).toBe("0.00")
    expect(saved.total.toFixed(2)).toBe("360.00")
    expect(saved.validUntil!.getTime()).toBeGreaterThanOrEqual(
      before + 15 * DAY_MS
    )
    expect(saved.number).toBe(quote.number)

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "quote.revalidate", entityId: quote.quoteId },
    })
    expect(audit.before).toMatchObject({ status: "EXPIRED", total: "320" })
    expect(audit.after).toMatchObject({ total: "360.00", changedLines: 1 })

    // Valid again: a second revalidation is refused
    expect(await revalidateMyQuote({ quoteId: quote.quoteId })).toMatchObject({
      success: false,
    })
  })

  it("refuses the revalidation when an item left the catalog", async () => {
    await login(customer)
    const quote = await seedQuote()
    await letExpire(quote.quoteId)
    await prisma.sku.update({
      where: { id: quote.sku.id },
      data: { active: false },
    })
    expect(await revalidateMyQuote({ quoteId: quote.quoteId })).toEqual({
      success: false,
      error:
        "Há itens desta cotação que não estão mais disponíveis. Solicite uma nova cotação.",
    })
    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: quote.quoteId },
      select: { status: true },
    })
    expect(saved.status).toBe("REQUESTED")
  })

  it("refuses the revalidation by another customer and by visitors", async () => {
    await login(customer)
    const quote = await seedQuote()
    await letExpire(quote.quoteId)

    await login(requester)
    expect(await revalidateMyQuote({ quoteId: quote.quoteId })).toEqual({
      success: false,
      error: "Cotação não encontrada.",
    })
    jar.clear()
    expect(await revalidateMyQuote({ quoteId: quote.quoteId })).toEqual({
      success: false,
      error: "Entre na sua conta para continuar.",
    })
  })
})
