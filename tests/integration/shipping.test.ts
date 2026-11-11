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
