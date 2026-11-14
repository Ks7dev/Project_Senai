import {
  afterAll,
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
const { addToCart } = await import("@/features/shared/lib/cart/cart-actions")
const { loadCurrentCart } =
  await import("@/features/shared/lib/cart/cart-store")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const CUSTOMER = "cliente.pf@atelierbureau.test"
const TABLE_NAME = "Teste de integração #52"

let tableId = ""

/** Removes the carts of the test customer. */
async function cleanCarts() {
  await prisma.cart.deleteMany({
    where: { OR: [{ userId: null }, { user: { email: CUSTOMER } }] },
  })
}

beforeAll(async () => {
  await cleanCarts()
  const table = await prisma.priceTable.create({
    data: { name: TABLE_NAME, discountPercent: "10.00" },
  })
  tableId = table.id
  await prisma.user.update({
    where: { email: CUSTOMER },
    data: { priceTableId: tableId },
  })
})

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  jar.clear()
  await cleanCarts()
})

afterAll(async () => {
  await cleanCarts()
  await prisma.user.update({
    where: { email: CUSTOMER },
    data: { priceTableId: null },
  })
  await prisma.priceTable.delete({ where: { id: tableId } })
  await prisma.$disconnect()
})

describe("customer prices in the cart (#52, RF21, RN04)", () => {
  it("prices the cart with the customer table", async () => {
    expect(await signIn({ email: CUSTOMER, password })).toEqual({
      success: true,
      twoFactor: false,
    })
    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 2 })
    const cart = await loadCurrentCart()
    expect(cart.priceTableName).toBe(TABLE_NAME)
    expect(cart.lines[0]).toMatchObject({
      unitPrice: "350.10",
      listUnitPrice: "389.00",
      total: "700.20",
    })
  })

  it("applies the seeded volume discount of the category", async () => {
    await signIn({ email: CUSTOMER, password })
    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 10 })
    const cart = await loadCurrentCart()
    // 10 × 350,10 = 3.501,00; 5% of volume discount (seed) = 175,05
    expect(cart).toMatchObject({
      subtotal: "3501.00",
      discount: "175.05",
      total: "3325.95",
    })
  })
})
