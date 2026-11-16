import { describe, expect, it } from "vitest"
import { passwordResetLink } from "@/features/shared/lib/auth/reset-link"

describe("password reset link (#33, RF40)", () => {
  it("opens the store reset page with the token", () => {
    expect(passwordResetLink("https://192.168.0.50/", "abc123")).toBe(
      "https://192.168.0.50/redefinir-senha?token=abc123"
    )
  })

  it("encodes the token and falls back to localhost", () => {
    expect(passwordResetLink(undefined, "a b&c")).toBe(
      "http://localhost:3000/redefinir-senha?token=a%20b%26c"
    )
  })
})
