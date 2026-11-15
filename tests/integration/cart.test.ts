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
const { signIn, signOut } =
  await import("@/features/access/sign-in/action/sign-in")
const { addToCart } = await import("@/features/shared/lib/cart/cart-actions")
const { GUEST_CART_COOKIE, loadCurrentCart } =
  await import("@/features/shared/lib/cart/cart-store")
const { removeCartItem, saveCartAsProjectList, updateCartItem } =
  await import("@/features/cart/cart-page/action/cart-page-actions")
const { deleteProjectList, listMyProjectLists, resumeProjectList } =
  await import("@/features/cart/project-lists/action/project-list-actions")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const CUSTOMER = "cliente.pf@atelierbureau.test"
const OTHER = "solicitante@empresa-ficticia.test"

/**
 * Logs in through the real sign-in action, keeping the cookies already
 * in the jar (the visitor cart cookie).
 *
 * @param email - Seed account e-mail.
 */
async function login(email: string) {
  const result = await signIn({ email, password })
  expect(result).toEqual({ success: true, twoFactor: false })
}

/**
 * Removes every cart and project list of the test accounts and every
 * visitor cart, so each test starts clean.
 */
async function cleanCarts() {
  await prisma.cart.deleteMany({
    where: {
      OR: [{ userId: null }, { user: { email: { in: [CUSTOMER, OTHER] } } }],
    },
  })
}

beforeAll(async () => {
  await cleanCarts()
})

beforeEach(async () => {
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  jar.clear()
  await cleanCarts()
})

afterAll(async () => {
  await cleanCarts()
  await prisma.$disconnect()
})

describe("cart kept after login (#46, RF07)", () => {
  it("creates a visitor cart identified by an httpOnly cookie", async () => {
    const result = await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 2 })
    expect(result).toEqual({ success: true, count: 2 })
    expect(jar.get(GUEST_CART_COOKIE)).toMatch(/^[A-Za-z0-9_-]{43}$/)

    const again = await addToCart({ skuCode: "PAP-CAD-A5-CAR" })
    expect(again).toEqual({ success: true, count: 3 })
    const cart = await loadCurrentCart()
    expect(cart.lines).toHaveLength(1)
    expect(cart.subtotal).toBe("1167.00")
  })

  it("moves the visitor cart into the account cart at login", async () => {
    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 2 })
    await addToCart({ skuCode: "ILU-ART-LAT", quantity: 1 })
    const guestToken = jar.get(GUEST_CART_COOKIE)!

    await login(CUSTOMER)

    expect(jar.has(GUEST_CART_COOKIE)).toBe(false)
    expect(await prisma.cart.count({ where: { guestToken } })).toBe(0)
    const cart = await loadCurrentCart()
    expect(cart.lines.map((line) => [line.skuCode, line.quantity])).toEqual([
      ["PAP-CAD-A5-CAR", 2],
      ["ILU-ART-LAT", 1],
    ])
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: CUSTOMER },
    })
    expect(
      await prisma.cart.count({ where: { userId: user.id, kind: "CART" } })
    ).toBe(1)
  })

  it("sums the quantities with the cart saved in the account", async () => {
    await login(CUSTOMER)
    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 1 })
    await signOut()
    jar.clear()

    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 4 })
    await login(CUSTOMER)

    const cart = await loadCurrentCart()
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0]?.quantity).toBe(5)
    expect(cart.count).toBe(5)
  })

  it("keeps the account cart between sessions", async () => {
    await login(CUSTOMER)
    await addToCart({ skuCode: "ORG-MOD-NOG", quantity: 1 })
    jar.clear()
    expect((await loadCurrentCart()).count).toBe(0)

    await login(CUSTOMER)
    expect((await loadCurrentCart()).lines[0]?.skuCode).toBe("ORG-MOD-NOG")
  })

  it("does not add variations that left the catalog", async () => {
    const result = await addToCart({ skuCode: "NAO-EXISTE" })
    expect(result).toEqual({
      success: false,
      error: "Produto indisponível no momento.",
    })
    const invalid = await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 0 })
    expect(invalid.success).toBe(false)
  })
})

describe("cart lines (#46)", () => {
  it("changes and removes only lines of the caller's cart", async () => {
    await login(OTHER)
    await addToCart({ skuCode: "ESC-TIN-HER-M" })
    const otherLine = (await loadCurrentCart()).lines[0]!

    jar.clear()
    await login(CUSTOMER)
    await addToCart({ skuCode: "PAP-CAD-A5-GRA" })
    const line = (await loadCurrentCart()).lines[0]!

    const updated = await updateCartItem({ itemId: line.id, quantity: 3 })
    expect(updated.success && updated.cart.count).toBe(3)

    const foreign = await updateCartItem({ itemId: otherLine.id, quantity: 9 })
    expect(foreign).toEqual({
      success: false,
      error: "Item não encontrado no seu carrinho.",
    })
    expect(
      (await prisma.cartItem.findUniqueOrThrow({ where: { id: otherLine.id } }))
        .quantity
    ).toBe(1)
    expect((await removeCartItem({ itemId: otherLine.id })).success).toBe(false)

    const removed = await removeCartItem({ itemId: line.id })
    expect(removed.success && removed.cart.lines).toEqual([])
  })
})

describe("project lists (#46, RF07)", () => {
  it("requires login to save a list", async () => {
    await addToCart({ skuCode: "PAP-CAD-A5-CAR" })
    const result = await saveCartAsProjectList({ name: "Sala de reuniões" })
    expect(result).toEqual({
      success: false,
      error: "Entre na sua conta para continuar.",
    })
  })

  it("saves the cart as a list, resumes it into the cart and deletes it", async () => {
    await login(CUSTOMER)
    await addToCart({ skuCode: "PAP-CAD-A5-CAR", quantity: 2 })
    await addToCart({ skuCode: "ORG-MOD-CAR", quantity: 1 })

    const saved = await saveCartAsProjectList({ name: "Sala de reuniões" })
    expect(saved.success).toBe(true)
    if (!saved.success) return
    // The cart is left as it was
    expect((await loadCurrentCart()).count).toBe(3)

    const listed = await listMyProjectLists()
    expect(listed.success && listed.lists).toMatchObject([
      { id: saved.listId, name: "Sala de reuniões", count: 3 },
    ])

    // Empty the cart, then resume the list
    for (const line of (await loadCurrentCart()).lines) {
      await removeCartItem({ itemId: line.id })
    }
    const resumed = await resumeProjectList({ listId: saved.listId })
    expect(resumed).toEqual({ success: true, added: 2, skipped: 0, count: 3 })
    const cart = await loadCurrentCart()
    expect(cart.lines.map((line) => line.skuCode).sort()).toEqual([
      "ORG-MOD-CAR",
      "PAP-CAD-A5-CAR",
    ])

    // Resuming again sums the quantities; the list is kept
    const again = await resumeProjectList({ listId: saved.listId })
    expect(again.success && again.count).toBe(6)

    expect((await deleteProjectList({ listId: saved.listId })).success).toBe(
      true
    )
    const row = await prisma.cart.findUniqueOrThrow({
      where: { id: saved.listId },
    })
    expect(row.deletedAt).toBeInstanceOf(Date)
    const after = await listMyProjectLists()
    expect(after.success && after.lists).toEqual([])
    expect(await resumeProjectList({ listId: saved.listId })).toEqual({
      success: false,
      error: "Lista não encontrada.",
    })
  })

  it("skips products that left the catalog when resuming", async () => {
    await login(CUSTOMER)
    await addToCart({ skuCode: "PAP-CAD-A5-CAR" })
    await addToCart({ skuCode: "ILU-ART-LAT" })
    const saved = await saveCartAsProjectList({ name: "Iluminação" })
    if (!saved.success) throw new Error(saved.error)
    for (const line of (await loadCurrentCart()).lines) {
      await removeCartItem({ itemId: line.id })
    }

    await prisma.sku.update({
      where: { code: "ILU-ART-LAT" },
      data: { active: false },
    })
    try {
      const resumed = await resumeProjectList({ listId: saved.listId })
      expect(resumed).toEqual({
        success: true,
        added: 1,
        skipped: 1,
        count: 1,
      })
    } finally {
      await prisma.sku.update({
        where: { code: "ILU-ART-LAT" },
        data: { active: true },
      })
    }
  })

  it("never shows or resumes another customer's list", async () => {
    await login(OTHER)
    await addToCart({ skuCode: "ESC-TIN-HER-M" })
    const saved = await saveCartAsProjectList({ name: "Diretoria" })
    if (!saved.success) throw new Error(saved.error)

    jar.clear()
    await login(CUSTOMER)
    const listed = await listMyProjectLists()
    expect(listed.success && listed.lists).toEqual([])
    expect((await resumeProjectList({ listId: saved.listId })).success).toBe(
      false
    )
    expect((await deleteProjectList({ listId: saved.listId })).success).toBe(
      false
    )
  })
})
