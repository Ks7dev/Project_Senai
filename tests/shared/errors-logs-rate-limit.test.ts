import { afterEach, describe, expect, it, vi } from "vitest"
import {
  AppError,
  GENERIC_ERROR_MESSAGE,
  toActionError,
} from "@/features/shared/lib/errors/action-result"
import { log, redact } from "@/features/shared/lib/logger/logger"
import {
  findRateLimitRule,
  RateLimiter,
} from "@/features/shared/lib/rate-limit/rate-limit"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("redact", () => {
  it("masks credentials, documents and headers, keeping safe fields", () => {
    const result = redact({
      orderId: "abc",
      password: "segredo",
      cpf: "123.456.789-00",
      customer: { email: "a@b.com", name: "Cliente Fictício" },
      headers: { authorization: "Bearer x" },
    })
    expect(result).toEqual({
      orderId: "abc",
      password: "[redacted]",
      cpf: "[redacted]",
      customer: { email: "[redacted]", name: "Cliente Fictício" },
      headers: "[redacted]",
    })
  })

  it("keeps only name and message of errors, dropping the stack", () => {
    const result = redact(new Error("boom")) as Record<string, unknown>
    expect(result).toEqual({ name: "Error", message: "boom" })
    expect(result).not.toHaveProperty("stack")
  })
})

describe("log", () => {
  it("writes one JSON line with level, message and request id", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    log("error", "action failed", { requestId: "req-1", token: "x" })
    const entry = JSON.parse(spy.mock.calls[0][0] as string)
    expect(entry).toMatchObject({
      level: "error",
      message: "action failed",
      requestId: "req-1",
      token: "[redacted]",
    })
    expect(entry.timestamp).toBeTypeOf("string")
  })
})

describe("toActionError", () => {
  it("returns the public message of expected errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(toActionError(new AppError("Estoque insuficiente"))).toEqual({
      success: false,
      error: "Estoque insuficiente",
    })
  })

  it("hides internal details of unexpected errors", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = toActionError(new Error("ER_DUP_ENTRY users.email"))
    expect(result).toEqual({ success: false, error: GENERIC_ERROR_MESSAGE })
    expect(result.error).not.toContain("ER_DUP_ENTRY")
  })
})

describe("RateLimiter", () => {
  it("blocks after the limit and frees the slot after the window", () => {
    let now = 0
    const limiter = new RateLimiter(() => now)
    const rule = { limit: 2, windowMs: 1000 }

    expect(limiter.check("ip", rule).allowed).toBe(true)
    expect(limiter.check("ip", rule).allowed).toBe(true)
    const blocked = limiter.check("ip", rule)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(1)

    now = 1001
    expect(limiter.check("ip", rule).allowed).toBe(true)
  })

  it("counts each key separately", () => {
    const limiter = new RateLimiter(() => 0)
    const rule = { limit: 1, windowMs: 1000 }
    expect(limiter.check("a", rule).allowed).toBe(true)
    expect(limiter.check("b", rule).allowed).toBe(true)
    expect(limiter.check("a", rule).allowed).toBe(false)
  })
})

describe("findRateLimitRule", () => {
  it("limits form posts on login and sign-up", () => {
    expect(findRateLimitRule("/entrar", "POST")?.name).toBe("auth")
    expect(findRateLimitRule("/cadastro", "POST")?.name).toBe("auth")
    expect(findRateLimitRule("/entrar", "GET")).toBeUndefined()
  })

  it("limits public APIs and ignores regular pages", () => {
    expect(findRateLimitRule("/api/webhooks/mercadopago", "POST")?.name).toBe(
      "api"
    )
    expect(findRateLimitRule("/categoria/iluminacao", "GET")).toBeUndefined()
  })
})
