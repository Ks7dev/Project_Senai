import { mkdtemp, readdir, rm } from "node:fs/promises"
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

const storageDir = await mkdtemp(join(tmpdir(), "atelier-quotes-"))
process.env.STORAGE_DIR = storageDir

const { prisma } = await import("@/features/shared/lib/db/prisma")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { getQuoteRequestForm, requestQuote } =
  await import("@/features/cart/quote-request/action/quote-request-actions")
const { downloadMyQuoteAttachment, getMyQuote, listMyQuotes } =
  await import("@/features/cart/customer-quotes/action/customer-quotes-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const fixtures = quoteFixtures(prisma)
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
 * Lists the files saved under the test storage folder.
 *
 * @returns Relative paths.
 */
async function storedFiles(): Promise<string[]> {
  try {
    return (await readdir(join(storageDir, "quotes"), { recursive: true }))
      .map(String)
      .filter((path) => path.includes("."))
  } catch {
    return []
  }
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterAll(async () => {
  await fixtures.cleanup()
  await prisma.$disconnect()
  await rm(storageDir, { recursive: true, force: true })
})

describe("quote request with attachments (#48, RF05, RF08)", () => {
  it("starts the form from the product page", async () => {
    const product = await fixtures.createProduct()
    await login(customer)
    const result = await getQuoteRequestForm({ produto: product.slug })
    if (!result.success) throw new Error(result.error)
    expect(result.form.source).toBe("product")
    expect(result.form.lines[0]).toMatchObject({
      skuId: product.id,
      quantity: 1,
      variations: [{ skuId: product.id, unitPrice: "100.00" }],
    })
  })

  it("creates a numbered quote with the attachment, followed in the customer area", async () => {
    const product = await fixtures.createProduct()
    await login(customer)
    const result = await requestQuote(
      fixtures.requestForm({
        lines: [{ skuId: product.id, quantity: 4 }],
        notes: "Projeto da sala de reuniões",
        files: [
          new File([PDF_BYTES], "planta.pdf", { type: "application/pdf" }),
        ],
      })
    )
    if (!result.success) throw new Error(result.error)
    expect(result.quote.number).toMatch(/^COT-\d{4}-\d{6}$/)

    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: result.quote.quoteId },
      include: { items: true, attachments: true },
    })
    expect(saved).toMatchObject({
      status: "REQUESTED",
      notes: "Projeto da sala de reuniões",
      organizationId: null,
    })
    expect(saved.total.toFixed(2)).toBe("400.00")
    expect(saved.items[0]).toMatchObject({ skuId: product.id, quantity: 4 })
    expect(saved.items[0].unitPrice?.toFixed(2)).toBe("100.00")
    expect(saved.attachments[0]).toMatchObject({
      name: "planta.pdf",
      mimeType: "application/pdf",
      sizeBytes: PDF_BYTES.length,
    })
    expect(saved.attachments[0].storageKey).toMatch(/^quotes\/.+\/1\.pdf$/)
    expect(
      await prisma.emailOutbox.count({
        where: { subject: { contains: result.quote.number } },
      })
    ).toBe(1)

    const list = await listMyQuotes()
    if (!list.success) throw new Error(list.error)
    expect(list.quotes.map((quote) => quote.number)).toContain(
      result.quote.number
    )
    const detail = await getMyQuote({ quoteId: result.quote.quoteId })
    if (!detail.success) throw new Error(detail.error)
    expect(detail.quote.lines[0]).toMatchObject({
      quantity: 4,
      unitPrice: "100.00",
      total: "400.00",
    })
    const download = await downloadMyQuoteAttachment({
      attachmentId: detail.quote.attachments[0].id,
    })
    if (!download.success) throw new Error(download.error)
    expect(Buffer.from(download.file.data, "base64")).toEqual(PDF_BYTES)

    // Another customer neither sees the quote nor downloads its files
    await login(requester)
    expect(await getMyQuote({ quoteId: result.quote.quoteId })).toEqual({
      success: false,
      error: "Cotação não encontrada.",
    })
    expect(
      await downloadMyQuoteAttachment({
        attachmentId: detail.quote.attachments[0].id,
      })
    ).toMatchObject({ success: false })
  })

  it("refuses a file whose content is not the declared type and keeps no file", async () => {
    const product = await fixtures.createProduct()
    await login(customer)
    const before = await storedFiles()
    const result = await requestQuote(
      fixtures.requestForm({
        lines: [{ skuId: product.id, quantity: 1 }],
        files: [
          new File([Buffer.from("MZ\x90\x00programa")], "planta.pdf", {
            type: "application/pdf",
          }),
        ],
      })
    )
    expect(result.success).toBe(false)
    expect(await storedFiles()).toEqual(before)
    expect(
      await prisma.quote.count({
        where: { items: { some: { skuId: product.id } } },
      })
    ).toBe(0)
  })

  it("shares a corporate quote with the company approver", async () => {
    const product = await fixtures.createProduct()
    await login(requester)
    const result = await requestQuote(
      fixtures.requestForm({ lines: [{ skuId: product.id, quantity: 2 }] })
    )
    if (!result.success) throw new Error(result.error)
    const saved = await prisma.quote.findUniqueOrThrow({
      where: { id: result.quote.quoteId },
      select: { organizationId: true },
    })
    expect(saved.organizationId).not.toBeNull()

    await login(approver)
    const detail = await getMyQuote({ quoteId: result.quote.quoteId })
    expect(detail.success).toBe(true)
  })

  it("refuses visitors", async () => {
    jar.clear()
    const product = await fixtures.createProduct()
    expect(
      await requestQuote(
        fixtures.requestForm({ lines: [{ skuId: product.id, quantity: 1 }] })
      )
    ).toEqual({ success: false, error: "Entre na sua conta para continuar." })
  })
})
