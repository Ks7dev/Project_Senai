import { randomUUID } from "node:crypto"
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
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
const { saveProduct, setProductStatus } =
  await import("@/features/catalog/products-admin/action/product-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const tag = randomUUID().slice(0, 8)
const productIds: string[] = []

/**
 * Creates a published product with one active SKU.
 *
 * @returns The product, its category and its SKU.
 */
async function createPublishedProduct() {
  const category = await prisma.category.findFirstOrThrow({
    select: { id: true },
  })
  const product = await prisma.product.create({
    data: {
      categoryId: category.id,
      slug: `teste-rn09-${tag}`,
      name: `Cadeira de teste ${tag}`,
      description: "Produto fictício criado pelo teste de integração.",
      basePrice: "100.00",
      weightKg: "1.000",
      lengthCm: "10.00",
      widthCm: "10.00",
      heightCm: "10.00",
      status: "ACTIVE",
      skus: {
        create: {
          code: `RN09-${tag}`.toUpperCase(),
          name: "Único",
          stock: { create: { onHand: 1 } },
        },
      },
    },
    select: { id: true, categoryId: true, skus: { select: { id: true } } },
  })
  productIds.push(product.id)
  return product
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } })
  await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  await prisma.$disconnect()
})

describe("certification rule on product edits (#21, RN09)", () => {
  it("unpublishes a published product that starts to require a missing certification", async () => {
    jar.clear()
    expect(
      await signIn({ email: "admin@atelierbureau.test", password })
    ).toEqual({ success: true, twoFactor: false })
    const product = await createPublishedProduct()
    const form = {
      id: product.id,
      name: `Cadeira de teste ${tag}`,
      slug: `teste-rn09-${tag}`,
      description: "Produto fictício criado pelo teste de integração.",
      categoryId: product.categoryId,
      basePrice: "100,00",
      weightKg: "1",
      lengthCm: "10",
      widthCm: "10",
      heightCm: "10",
      warrantyMonths: 12,
      leadTimeDays: 5,
      specs: [],
      skus: [
        {
          id: product.skus[0].id,
          code: `RN09-${tag}`.toUpperCase(),
          name: "Único",
          active: true,
        },
      ],
    }

    const unchanged = await saveProduct({
      ...form,
      requiresCertification: false,
    })
    expect(unchanged).toEqual({
      success: true,
      id: product.id,
      unpublished: null,
    })

    const result = await saveProduct({ ...form, requiresCertification: true })
    expect(result.success).toBe(true)
    expect(result.success && result.unpublished).toContain("certificação")
    const saved = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { status: true },
    })
    expect(saved.status).toBe("DRAFT")

    const publish = await setProductStatus({ id: product.id, status: "ACTIVE" })
    expect(publish.success).toBe(false)
  })
})
