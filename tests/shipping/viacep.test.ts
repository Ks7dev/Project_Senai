import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  cepLookupSchema,
  formatCep,
  isValidCep,
} from "@/features/shared/schema/cep-schema"
import { cepLookupMessage } from "@/features/shared/lib/viacep/use-cep-lookup"
import { lookupCep } from "@/features/shared/lib/viacep/viacep"

/**
 * Fake fetch that answers with a JSON body.
 *
 * @param body - Response body.
 * @param status - HTTP status.
 * @returns The fake fetch.
 */
function jsonFetch(body: unknown, status = 200) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("CEP validation before the lookup (RF24)", () => {
  it("accepts 8 digits with or without the hyphen", () => {
    expect(isValidCep("01310-100")).toBe(true)
    expect(isValidCep("01310100")).toBe(true)
    expect(cepLookupSchema.parse({ cep: "01310-100" })).toEqual({
      cep: "01310100",
    })
    expect(formatCep("01310100")).toBe("01310-100")
  })

  it("rejects CEPs without exactly 8 digits", () => {
    expect(isValidCep("0131010")).toBe(false)
    expect(isValidCep("013101000")).toBe(false)
    expect(isValidCep("")).toBe(false)
    expect(cepLookupSchema.safeParse({ cep: "1234" }).success).toBe(false)
  })

  it("never calls ViaCEP with an invalid CEP", async () => {
    const fetcher = jsonFetch({})
    expect(await lookupCep("123", fetcher)).toEqual({ status: "not_found" })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe("ViaCEP lookup with fallback (RF22, RF23, RF38, RN21)", () => {
  it("fills street, district, city and state", async () => {
    const fetcher = jsonFetch({
      cep: "01310-100",
      logradouro: "Avenida Paulista",
      bairro: "Bela Vista",
      localidade: "São Paulo",
      uf: "SP",
    })
    const result = await lookupCep("01310-100", fetcher)
    expect(result).toEqual({
      status: "found",
      complete: true,
      address: {
        street: "Avenida Paulista",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      },
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://viacep.com.br/ws/01310100/json/",
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    )
  })

  it("flags a city-wide CEP as incomplete so the customer types the street", async () => {
    const fetcher = jsonFetch({
      logradouro: "",
      bairro: "",
      localidade: "Monte Alegre do Sul",
      uf: "SP",
    })
    const result = await lookupCep("13910000", fetcher)
    expect(result).toMatchObject({ status: "found", complete: false })
    expect(cepLookupMessage({ status: "found", complete: false })).toContain(
      "Complete a rua"
    )
  })

  it("returns not_found when ViaCEP answers with erro", async () => {
    expect(await lookupCep("99999999", jsonFetch({ erro: true }))).toEqual({
      status: "not_found",
    })
    expect(await lookupCep("99999999", jsonFetch({ erro: "true" }))).toEqual({
      status: "not_found",
    })
  })

  it("returns unavailable on server errors", async () => {
    expect(await lookupCep("01310100", jsonFetch({}, 503))).toEqual({
      status: "unavailable",
    })
  })

  it("returns unavailable on timeout instead of throwing", async () => {
    vi.stubEnv("VIACEP_TIMEOUT_MS", "20")
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "TimeoutError"))
          )
        })
    ) as unknown as typeof fetch
    expect(await lookupCep("01310100", slow)).toEqual({
      status: "unavailable",
    })
  })

  it("returns unavailable on network errors and malformed payloads", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed")
    }) as unknown as typeof fetch
    expect(await lookupCep("01310100", offline)).toEqual({
      status: "unavailable",
    })
    expect(await lookupCep("01310100", jsonFetch({ uf: "SP" }))).toEqual({
      status: "unavailable",
    })
  })

  it("never logs the CEP or the payload", async () => {
    const logs = vi.spyOn(console, "error").mockImplementation(() => {})
    await lookupCep("01310100", jsonFetch({}, 500))
    const written = logs.mock.calls.flat().join(" ")
    expect(written).not.toContain("01310100")
  })

  it("tells the customer the purchase continues when ViaCEP is down", () => {
    expect(cepLookupMessage({ status: "unavailable" })).toContain(
      "Preencha o endereço manualmente"
    )
    expect(cepLookupMessage({ status: "idle" })).toBeNull()
  })
})
