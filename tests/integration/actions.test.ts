import { randomUUID } from "node:crypto"
import { base32 } from "@better-auth/utils/base32"
import { createOTP } from "@better-auth/utils/otp"
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
const { signIn, signOut, verifyTwoFactor } =
  await import("@/features/access/sign-in/action/sign-in")
const { signUp } = await import("@/features/access/sign-up/action/sign-up")
const { getCurrentUser } = await import("@/features/shared/lib/auth/session")
const { requestPasswordReset, resetPassword } =
  await import("@/features/access/password-reset/action/password-reset")
const { startTwoFactor, confirmTwoFactor, disableTwoFactor } =
  await import("@/features/access/security/action/two-factor")
const { saveAddress, listAddresses, deleteAddress } =
  await import("@/features/account/addresses/action/address-actions")
const { setFavorite, listMyFavoriteIds } =
  await import("@/features/shared/lib/favorites/favorite-actions")
const { saveCategory, toggleCategory } =
  await import("@/features/catalog/categories/action/category-actions")
const { getTeam } =
  await import("@/features/access/corporate-members/action/members-actions")
const { queryCatalog, searchSuggestions } =
  await import("@/features/shared/lib/catalog/catalog-query")
const { parseCatalogFilters } =
  await import("@/features/shared/lib/catalog/catalog-filters")

const password = process.env.SEED_PASSWORD || "atelier-demo-2026"
const run = randomUUID().slice(0, 8)
const created = {
  emails: [] as string[],
  categorySlugs: [] as string[],
  productSlugs: [] as string[],
}

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
 * Valid CPF built from a random base (check digits computed).
 *
 * @returns Eleven digits.
 */
function randomCpf() {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  const digit = (numbers: number[]) => {
    const sum = numbers.reduce(
      (total, n, i) => total + n * (numbers.length + 1 - i),
      0
    )
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  const first = digit(base)
  return [...base, first, digit([...base, first])].join("")
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: created.emails } } })
  await prisma.product.deleteMany({
    where: { slug: { in: created.productSlugs } },
  })
  await prisma.category.deleteMany({
    where: { slug: { in: created.categorySlugs } },
  })
  await prisma.$disconnect()
})

describe("authentication against MySQL (RF39)", () => {
  it("logs in with a seed account and reads the session back", async () => {
    await login("cliente.pf@atelierbureau.test")
    const user = await getCurrentUser()
    expect(user?.email).toBe("cliente.pf@atelierbureau.test")
  })

  it("refuses a wrong password without saying which field failed", async () => {
    jar.clear()
    const result = await signIn({
      email: "cliente.pf@atelierbureau.test",
      password: "senha-errada-123",
    })
    expect(result).toEqual({
      success: false,
      error: "E-mail ou senha incorretos.",
    })
    expect(await getCurrentUser()).toBeNull()
  })

  it("signs up a PF account with a hashed password", async () => {
    jar.clear()
    const email = `teste.${run}@atelierbureau.test`
    created.emails.push(email)
    const cpf = randomCpf()
    const result = await signUp({
      personType: "PF",
      name: "Pessoa de Teste",
      email,
      cpf,
      phone: "11987654321",
      password: "Senha-Forte-2026",
      confirmPassword: "Senha-Forte-2026",
      acceptTerms: true,
    } as never)
    expect(result).toEqual({ success: true })
    const account = await prisma.account.findFirst({
      where: { user: { email } },
      select: { password: true },
    })
    expect(account?.password).toBeTruthy()
    expect(account?.password).not.toContain("Senha-Forte-2026")

    const again = await signUp({
      personType: "PF",
      name: "Outra Pessoa",
      email: `outro.${run}@atelierbureau.test`,
      cpf,
      phone: "11987654321",
      password: "Senha-Forte-2026",
      confirmPassword: "Senha-Forte-2026",
      acceptTerms: true,
    } as never)
    expect(again).toEqual({
      success: false,
      error: "Este CPF já tem cadastro.",
    })
  })

  it("logs out and drops the session", async () => {
    await login("cliente.pf@atelierbureau.test")
    expect(await signOut()).toEqual({ success: true })
    expect(await getCurrentUser()).toBeNull()
  })
})

describe("customer actions against MySQL", () => {
  it("creates, lists and deletes an address of the session user (RF26)", async () => {
    await login("cliente.pf@atelierbureau.test")
    const saved = await saveAddress({
      label: `Teste ${run}`,
      recipient: "Recepção",
      cep: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    } as never)
    expect(saved.success).toBe(true)
    if (!saved.success) return

    const list = await listAddresses()
    expect(list.success).toBe(true)
    if (list.success) {
      expect(
        (list as unknown as { addresses: Array<{ id: string }> }).addresses.map(
          (address) => address.id
        )
      ).toContain(saved.id)
    }
    expect(await deleteAddress({ id: saved.id })).toEqual({ success: true })
  })

  it("does not let another user delete the address", async () => {
    await login("cliente.pf@atelierbureau.test")
    const saved = await saveAddress({
      label: `Alheio ${run}`,
      recipient: "Recepção",
      cep: "01310-100",
      street: "Avenida Paulista",
      number: "1000",
      district: "Bela Vista",
      city: "São Paulo",
      state: "SP",
    } as never)
    expect(saved.success).toBe(true)
    if (!saved.success) return

    await login("comercial@atelierbureau.test")
    const denied = await deleteAddress({ id: saved.id })
    expect(denied.success).toBe(false)

    await login("cliente.pf@atelierbureau.test")
    expect(await deleteAddress({ id: saved.id })).toEqual({ success: true })
  })

  it("adds and removes a favorite (RF45)", async () => {
    await login("cliente.pf@atelierbureau.test")
    const product = await prisma.product.findFirstOrThrow({
      where: { status: "ACTIVE" },
      select: { id: true },
    })
    expect(
      await setFavorite({ productId: product.id, favorite: true })
    ).toEqual({ success: true, favorite: true })
    const listed = await listMyFavoriteIds()
    expect(listed.success && listed.productIds).toContain(product.id)
    await setFavorite({ productId: product.id, favorite: false })
    const after = await listMyFavoriteIds()
    expect(after.success && after.productIds).not.toContain(product.id)
  })
})

describe("back office and corporate permissions against MySQL", () => {
  it("lets the admin create and deactivate a category (RF01)", async () => {
    await login("admin@atelierbureau.test")
    const slug = `teste-${run}`
    created.categorySlugs.push(slug)
    const saved = await saveCategory({
      name: `Teste ${run}`,
      slug,
      active: true,
    })
    expect(saved.success).toBe(true)
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    })
    expect(
      (await toggleCategory({ id: category.id, active: false })).success
    ).toBe(true)
    const audit = await prisma.auditLog.count({
      where: { entityId: category.id },
    })
    expect(audit).toBeGreaterThan(0)
  })

  it("refuses the category action for a customer", async () => {
    await login("cliente.pf@atelierbureau.test")
    const result = await saveCategory({ name: `Negado ${run}`, active: true })
    expect(result.success).toBe(false)
  })

  it("shows the corporate team to the company admin (RF10)", async () => {
    await login("aprovador@empresa-ficticia.test")
    const result = await getTeam()
    expect(result.success).toBe(true)
  })

  it("refuses the team to a requester without member:manage", async () => {
    await login("solicitante@empresa-ficticia.test")
    const result = await getTeam()
    expect(result.success).toBe(false)
  })
})

describe("password reset against MySQL (#33, RF40)", () => {
  const email = `recupera.${run}@atelierbureau.test`
  const linkError = {
    success: false,
    error: "Este link expirou ou já foi usado. Peça um novo link.",
  }

  beforeAll(async () => {
    created.emails.push(email)
    const result = await signUp({
      personType: "PF",
      name: "Pessoa da Recuperação",
      email,
      cpf: randomCpf(),
      phone: "11987654321",
      password: "Senha-Antiga-2026",
      confirmPassword: "Senha-Antiga-2026",
      acceptTerms: true,
    } as never)
    expect(result).toEqual({ success: true })
  })

  /**
   * Requests a reset link through the real action and reads the token
   * Better Auth stored for the user.
   *
   * @returns The newest reset token.
   */
  async function issueToken(): Promise<string> {
    jar.clear()
    expect(await requestPasswordReset({ email })).toEqual({ success: true })
    const user = await prisma.user.findUniqueOrThrow({
      where: { email },
      select: { id: true },
    })
    const verification = await prisma.verification.findFirstOrThrow({
      where: { value: user.id, identifier: { startsWith: "reset-password:" } },
      orderBy: { createdAt: "desc" },
    })
    return verification.identifier.slice("reset-password:".length)
  }

  const reset = (token: string, password: string) =>
    resetPassword({ token, password, confirmPassword: password })

  it("answers the same way for unknown e-mails", async () => {
    expect(
      await requestPasswordReset({ email: `ninguem.${run}@atelierbureau.test` })
    ).toEqual({ success: true })
  })

  it("expires the token in one hour", async () => {
    const token = await issueToken()
    const verification = await prisma.verification.findFirstOrThrow({
      where: { identifier: `reset-password:${token}` },
    })
    const lifetime =
      verification.expiresAt.getTime() - verification.createdAt.getTime()
    expect(Math.round(lifetime / 60_000)).toBe(60)

    await prisma.verification.update({
      where: { id: verification.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })
    expect(await reset(token, "Senha-Expirada-2026")).toEqual(linkError)
  })

  it("accepts the token once and refuses it afterwards", async () => {
    const token = await issueToken()
    expect(await reset(token, "Senha-Nova-2026!")).toEqual({ success: true })
    expect(await reset(token, "Senha-Outra-2026!")).toEqual(linkError)

    jar.clear()
    expect(await signIn({ email, password: "Senha-Nova-2026!" })).toEqual({
      success: true,
      twoFactor: false,
    })
  })
})

describe("optional 2FA for corporate accounts against MySQL (#33, RF40)", () => {
  const corporateEmail = "solicitante@empresa-ficticia.test"

  afterAll(async () => {
    // Leaves the seed account as it was, even if a test failed midway
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: corporateEmail },
      select: { id: true },
    })
    await prisma.twoFactor.deleteMany({ where: { userId: user.id } })
    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: false },
    })
  })

  it("is not offered to accounts outside a corporate account", async () => {
    await login("cliente.pf@atelierbureau.test")
    expect(await startTwoFactor({ password })).toEqual({
      success: false,
      error:
        "A verificação em duas etapas está disponível para contas corporativas.",
    })
  })

  it("is turned on by a corporate user and then required at login", async () => {
    await login(corporateEmail)
    const started = await startTwoFactor({ password })
    expect(started.success).toBe(true)
    if (!started.success) return
    expect(started.backupCodes.length).toBeGreaterThan(0)

    // Still off until the first code is confirmed
    const pending = await prisma.user.findUniqueOrThrow({
      where: { email: corporateEmail },
      select: { twoFactorEnabled: true },
    })
    expect(pending.twoFactorEnabled).not.toBe(true)

    expect(await confirmTwoFactor({ code: "000000" })).toEqual({
      success: false,
      error: "Código incorreto.",
    })

    const secret = new URL(started.totpUri).searchParams.get("secret")!
    const code = await createOTP(base32.decode(secret)).totp()
    expect(await confirmTwoFactor({ code })).toEqual({ success: true })
    const enabled = await prisma.user.findUniqueOrThrow({
      where: { email: corporateEmail },
      select: { twoFactorEnabled: true },
    })
    expect(enabled.twoFactorEnabled).toBe(true)

    jar.clear()
    expect(await signIn({ email: corporateEmail, password })).toEqual({
      success: true,
      twoFactor: true,
    })
    expect(await getCurrentUser()).toBeNull()
    expect(
      await verifyTwoFactor({
        code: await createOTP(base32.decode(secret)).totp(),
      })
    ).toEqual({ success: true })
    expect((await getCurrentUser())?.email).toBe(corporateEmail)

    expect(await disableTwoFactor({ password: "senha-errada" })).toEqual({
      success: false,
      error: "Senha incorreta.",
    })
    expect(await disableTwoFactor({ password })).toEqual({ success: true })

    jar.clear()
    expect(await signIn({ email: corporateEmail, password })).toEqual({
      success: true,
      twoFactor: false,
    })
  })
})

describe("product search against MySQL (#25, RF02)", () => {
  const productData = (slug: string, categoryId: string) => ({
    categoryId,
    slug,
    description: "Produto fictício de teste da busca.",
    basePrice: "1290.00",
    weightKg: "0.500",
    lengthCm: "20.00",
    widthCm: "15.00",
    heightCm: "3.00",
  })

  beforeAll(async () => {
    const categorySlug = `busca-${run}`
    created.categorySlugs.push(categorySlug)
    const category = await prisma.category.create({
      data: { name: `Busca ${run}`, slug: categorySlug, active: true },
    })
    const published = `agenda-onix-${run}`
    const inactive = `agenda-onix-antiga-${run}`
    created.productSlugs.push(published, inactive)
    await prisma.product.create({
      data: {
        ...productData(published, category.id),
        name: `Agenda Ônix ${run}`,
        brand: `Marca ${run}`,
        specs: { Acabamento: `Têxtil ${run}`, Folhas: "240" },
        status: "ACTIVE",
      },
    })
    await prisma.product.create({
      data: {
        ...productData(inactive, category.id),
        name: `Agenda Ônix ${run} antiga`,
        specs: { Acabamento: `Têxtil ${run}` },
        status: "INACTIVE",
      },
    })
  })

  const slugsFor = async (params: Record<string, string>) =>
    (await queryCatalog(parseCatalogFilters(params))).products.map(
      (product) => product.slug
    )

  it("ignores accents and case in the product name", async () => {
    expect(await slugsFor({ q: `AGENDA ONIX ${run}` })).toEqual([
      `agenda-onix-${run}`,
    ])
  })

  it("finds products by a technical specification value", async () => {
    expect(await slugsFor({ q: `textil ${run}` })).toEqual([
      `agenda-onix-${run}`,
    ])
  })

  it("matches % and _ literally", async () => {
    expect(await slugsFor({ q: `%${run}` })).toEqual([])
  })

  it("never shows inactive products, in results or suggestions", async () => {
    expect(await slugsFor({ q: `antiga ${run}` })).toEqual([])
    const suggestions = await searchSuggestions(`onix ${run}`)
    expect(suggestions.products.map((product) => product.slug)).toEqual([
      `agenda-onix-${run}`,
    ])
  })

  it("applies the listing filters to the results", async () => {
    expect(
      await slugsFor({ q: `textil ${run}`, marca: `Marca ${run}` })
    ).toEqual([`agenda-onix-${run}`])
    expect(
      await slugsFor({ q: `textil ${run}`, marca: "Outra marca" })
    ).toEqual([])
    expect(await slugsFor({ q: `textil ${run}`, max: "100" })).toEqual([])
  })
})
