import {
  afterAll,
  afterEach,
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
