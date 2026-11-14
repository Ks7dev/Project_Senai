import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  sellerPhoneSchema,
  sellerRuleSchema,
} from "@/features/after-sales/seller-routing/schema/seller-routing-schema"
import { sellerContactSourceSchema } from "@/features/after-sales/seller-contact/schema/seller-contact-schema"
import {
  pickSellerRule,
  sellerGreeting,
  whatsappLink,
  type SellerRuleCandidate,
} from "@/features/shared/lib/sellers/seller-routing"
import { accounts, roles, sellerRules } from "@/prisma/seed-data"

const getCorporateContext = vi.fn()
const organizationFindUnique = vi.fn()
const userFindUnique = vi.fn()
const addressFindFirst = vi.fn()
const sellerRuleFindMany = vi.fn()

vi.mock("@/features/shared/lib/db/corporate", () => ({
  getCorporateContext: () => getCorporateContext(),
}))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    organization: { findUnique: (a: unknown) => organizationFindUnique(a) },
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    address: { findFirst: (a: unknown) => addressFindFirst(a) },
    sellerRule: { findMany: (a: unknown) => sellerRuleFindMany(a) },
  },
}))

const { resolveDedicatedSeller } =
  await import("@/features/shared/lib/sellers/dedicated-seller")

/**
 * Builds a rule for the tests.
 *
 * @param id - Rule id, also used as seller id.
 * @param personType - Segment.
 * @param state - State.
 * @param day - Creation day, for ties.
 * @returns The rule.
 */
function rule(
  id: string,
  personType: "PF" | "PJ" | null,
  state: string | null,
  day = 1
): SellerRuleCandidate & {
  seller: {
    id: string
    name: string
    email: string
    phone: string
    deletedAt: null
  }
} {
  return {
    id,
    sellerId: id,
    personType,
    state,
    createdAt: new Date(Date.UTC(2026, 10, day)),
    seller: {
      id,
      name: `Vendedor ${id}`,
      email: `${id}@atelier.test`,
      phone: "11912345678",
      deletedAt: null,
    },
  }
}

describe("seller by region or segment (#69, RN11)", () => {
  const rules = [
    rule("general", null, null),
    rule("pj", "PJ", null),
    rule("sp", null, "SP"),
    rule("sp-pj", "PJ", "SP"),
  ]

  it("picks the most specific rule", () => {
    expect(pickSellerRule(rules, { personType: "PJ", state: "SP" })?.id).toBe(
      "sp-pj"
    )
    expect(pickSellerRule(rules, { personType: "PF", state: "SP" })?.id).toBe(
      "sp"
    )
    expect(pickSellerRule(rules, { personType: "PJ", state: "RJ" })?.id).toBe(
      "pj"
    )
    expect(pickSellerRule(rules, { personType: "PF", state: "RJ" })?.id).toBe(
      "general"
    )
  })

  it("gives visitors the general rule and breaks ties by age", () => {
    expect(pickSellerRule(rules, { personType: null, state: null })?.id).toBe(
      "general"
    )
    expect(
      pickSellerRule([rule("new", null, "MG", 9), rule("old", null, "MG", 2)], {
        personType: "PF",
        state: "MG",
      })?.id
    ).toBe("old")
    expect(
      pickSellerRule([rule("pj", "PJ", null)], {
        personType: "PF",
        state: null,
      })
    ).toBe(null)
  })

  it("seeds a general rule for a sales account with a WhatsApp", () => {
    const sales = roles.find((role) => role.key === "sales")!
    for (const seed of sellerRules) {
      const account = accounts.find((a) => a.email === seed.sellerEmail)
      expect(account?.roles).toContain(sales.key)
      expect(seed.sellerPhone).toMatch(/^\d{10,11}$/)
    }
    expect(sellerRules.some((seed) => !seed.personType && !seed.state)).toBe(
      true
    )
  })
})

describe("dedicated seller of the customer (#69, RF18)", () => {
  beforeEach(() => {
    getCorporateContext.mockReset()
    organizationFindUnique.mockReset()
    userFindUnique.mockReset()
    addressFindFirst.mockReset()
    sellerRuleFindMany.mockReset()
    sellerRuleFindMany.mockResolvedValue([
      rule("general", null, null),
      rule("sp-pf", "PF", "SP"),
      rule("pj", "PJ", null),
    ])
  })

  const user = { id: "u1", name: "Cliente", email: "c@x.test" }

  it("keeps the seller assigned to the corporate account", async () => {
    getCorporateContext.mockResolvedValue({
      user,
      organizationId: "org1",
      roles: ["requester"],
    })
    organizationFindUnique.mockResolvedValue({
      seller: {
        id: "s9",
        name: "Vendedora da Conta",
        email: "s9@x.test",
        phone: null,
        deletedAt: null,
      },
    })
    const seller = await resolveDedicatedSeller(user)
    expect(seller).toMatchObject({ id: "s9", source: "account" })
    expect(sellerRuleFindMany).not.toHaveBeenCalled()
  })

  it("routes a corporate account without seller by segment", async () => {
    getCorporateContext.mockResolvedValue({
      user,
      organizationId: "org1",
      roles: ["requester"],
    })
    organizationFindUnique.mockResolvedValue({ seller: null })
    addressFindFirst.mockResolvedValue({ state: "SP" })
    expect(await resolveDedicatedSeller(user)).toMatchObject({
      id: "pj",
      source: "rule",
    })
    expect(addressFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org1", deletedAt: null },
      })
    )
  })

  it("routes a PF customer by the state of the address", async () => {
    getCorporateContext.mockResolvedValue(null)
    userFindUnique.mockResolvedValue({ personType: "PF" })
    addressFindFirst.mockResolvedValue({ state: "SP" })
    expect((await resolveDedicatedSeller(user))?.id).toBe("sp-pf")
    addressFindFirst.mockResolvedValue(null)
    expect((await resolveDedicatedSeller(user))?.id).toBe("general")
  })

  it("gives visitors the general seller", async () => {
    expect((await resolveDedicatedSeller(null))?.id).toBe("general")
    expect(getCorporateContext).not.toHaveBeenCalled()
  })
})

describe("WhatsApp link and forms (#69)", () => {
  it("builds the wa.me link with the Brazilian code", () => {
    expect(whatsappLink("(11) 91234-5678", "Olá")).toBe(
      "https://wa.me/5511912345678?text=Ol%C3%A1"
    )
    expect(whatsappLink("5511912345678", "Oi")).toBe(
      "https://wa.me/5511912345678?text=Oi"
    )
    expect(whatsappLink("1234", "Oi")).toBe(null)
    expect(whatsappLink(null, "Oi")).toBe(null)
  })

  it("names the product or the cart in the first message", () => {
    expect(
      sellerGreeting({ sellerName: "Ana Souza", productName: "Caneta" })
    ).toContain("Olá, Ana! Vim do site da Atelier Bureau")
    expect(sellerGreeting({ sellerName: "Ana", fromCart: true })).toContain(
      "itens do meu carrinho"
    )
  })

  it("accepts only product slugs and the cart as origin", () => {
    expect(
      sellerContactSourceSchema.parse({ produto: "caneta-tinteiro" })
    ).toEqual({ produto: "caneta-tinteiro", origem: undefined })
    expect(
      sellerContactSourceSchema.parse({ produto: "<script>", origem: "x" })
    ).toEqual({ produto: undefined, origem: undefined })
  })

  it("validates the rule and the WhatsApp of the seller", () => {
    expect(
      sellerRuleSchema.safeParse({ sellerId: "s1", personType: "", state: "" })
        .success
    ).toBe(true)
    expect(
      sellerRuleSchema.safeParse({
        sellerId: "s1",
        personType: "PJ",
        state: "XX",
      }).success
    ).toBe(false)
    expect(
      sellerPhoneSchema.parse({ sellerId: "s1", phone: "(11) 91234-5678" })
        .phone
    ).toBe("11912345678")
    expect(
      sellerPhoneSchema.safeParse({ sellerId: "s1", phone: "1234" }).success
    ).toBe(false)
  })
})
