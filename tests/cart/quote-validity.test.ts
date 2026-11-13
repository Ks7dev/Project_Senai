import { describe, expect, it } from "vitest"
import {
  effectiveQuoteStatus,
  isQuoteExpired,
  quoteValidUntil,
} from "@/features/shared/lib/quotes/quote-validity"

const requestedAt = new Date("2026-11-01T15:00:00.000Z")
const validUntil = quoteValidUntil(requestedAt, 15)

describe("quote validity (#49, RN02)", () => {
  it("ends the configured calendar days after the prices were given", () => {
    expect(validUntil.toISOString()).toBe("2026-11-16T15:00:00.000Z")
    expect(quoteValidUntil(requestedAt, 30).toISOString()).toBe(
      "2026-12-01T15:00:00.000Z"
    )
  })

  it("keeps an open quote valid until the last instant", () => {
    const lastInstant = new Date(validUntil.getTime() - 1)
    for (const status of [
      "REQUESTED",
      "IN_REVIEW",
      "ANSWERED",
      "ACCEPTED",
    ] as const) {
      expect(isQuoteExpired({ status, validUntil }, lastInstant)).toBe(false)
      expect(isQuoteExpired({ status, validUntil }, validUntil)).toBe(true)
    }
  })

  it("shows an open quote past its validity as expired before the job runs", () => {
    const later = new Date("2026-11-20T00:00:00.000Z")
    expect(
      effectiveQuoteStatus({ status: "ANSWERED", validUntil }, later)
    ).toBe("EXPIRED")
    expect(
      effectiveQuoteStatus({ status: "ANSWERED", validUntil }, requestedAt)
    ).toBe("ANSWERED")
  })

  it("never expires final quotes nor quotes without validity", () => {
    const later = new Date("2027-01-01T00:00:00.000Z")
    expect(isQuoteExpired({ status: "CONVERTED", validUntil }, later)).toBe(
      false
    )
    expect(isQuoteExpired({ status: "REJECTED", validUntil }, later)).toBe(
      false
    )
    expect(
      isQuoteExpired({ status: "REQUESTED", validUntil: null }, later)
    ).toBe(false)
    expect(isQuoteExpired({ status: "EXPIRED", validUntil: null }, later)).toBe(
      true
    )
  })
})
