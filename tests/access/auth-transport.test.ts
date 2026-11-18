import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  checkAuthBaseUrl,
  shouldUseSecureCookies,
} from "@/features/shared/lib/auth/auth-transport"

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("session cookie transport (SEC-001, #220)", () => {
  it("forces Secure cookies in production, whatever BETTER_AUTH_URL says", () => {
    expect(
      shouldUseSecureCookies({
        nodeEnv: "production",
        baseUrl: "http://localhost:3000",
      })
    ).toBe(true)
    expect(shouldUseSecureCookies({ nodeEnv: "production" })).toBe(true)
  })

  it("keeps plain cookies in development and tests", () => {
    expect(
      shouldUseSecureCookies({
        nodeEnv: "development",
        baseUrl: "http://localhost:3000",
      })
    ).toBe(false)
    expect(shouldUseSecureCookies({ nodeEnv: "test" })).toBe(false)
  })

  it("logs an error, without throwing, for an http URL in production", () => {
    expect(
      checkAuthBaseUrl({
        nodeEnv: "production",
        baseUrl: "http://192.168.0.50",
      })
    ).toBe(false)
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("BETTER_AUTH_URL must use https in production")
    )
    // Only the scheme reaches the log, never the host
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("192.168.0.50")
    )
  })

  it("logs an error when the URL is missing in production", () => {
    expect(checkAuthBaseUrl({ nodeEnv: "production" })).toBe(false)
    expect(console.error).toHaveBeenCalledTimes(1)
  })

  it("accepts https in production and anything in development", () => {
    expect(
      checkAuthBaseUrl({
        nodeEnv: "production",
        baseUrl: "https://192.168.0.50",
      })
    ).toBe(true)
    expect(
      checkAuthBaseUrl({
        nodeEnv: "development",
        baseUrl: "http://localhost:3000",
      })
    ).toBe(true)
    expect(console.error).not.toHaveBeenCalled()
  })
})
