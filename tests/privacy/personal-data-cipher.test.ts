import { afterEach, describe, expect, it, vi } from "vitest"
import {
  decryptPersonal,
  encryptPersonal,
  encryptPersonalOptional,
  isEncryptedPersonal,
} from "@/features/shared/lib/crypto/personal-data-cipher"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("personal data encryption at rest (RNF03, #75)", () => {
  it("does not store the CPF in plain text and reads it back", () => {
    const stored = encryptPersonal("12345678909")
    expect(stored).not.toContain("12345678909")
    expect(isEncryptedPersonal(stored)).toBe(true)
    expect(decryptPersonal(stored)).toBe("12345678909")
  })

  it("gives the same ciphertext for the same value, so the unique CPF index and lookups work", () => {
    expect(encryptPersonal("12345678909")).toBe(encryptPersonal("12345678909"))
    expect(encryptPersonal("12345678909")).not.toBe(
      encryptPersonal("98765432100")
    )
  })

  it("fits the 80 character column for CPF, CNPJ and phone", () => {
    expect(encryptPersonal("12345678000195").length).toBeLessThanOrEqual(80)
    expect(encryptPersonal("5511987654321").length).toBeLessThanOrEqual(80)
    expect(encryptPersonal("9".repeat(20)).length).toBeLessThanOrEqual(80)
  })

  it("does not encrypt twice and keeps empty values empty", () => {
    const stored = encryptPersonal("11987654321")
    expect(encryptPersonal(stored)).toBe(stored)
    expect(encryptPersonalOptional("")).toBe("")
    expect(encryptPersonalOptional(null)).toBeNull()
    expect(encryptPersonalOptional(undefined)).toBeUndefined()
  })

  it("reads legacy plain values and the anonymized placeholder as they are", () => {
    expect(decryptPersonal("12345678909")).toBe("12345678909")
    expect(decryptPersonal("XA1B2C3D4E5F6A")).toBe("XA1B2C3D4E5F6A")
    expect(decryptPersonal(null)).toBeNull()
  })

  it("refuses a tampered value", () => {
    const stored = encryptPersonal("12345678909")
    const tampered = `${stored.slice(0, -2)}${stored.endsWith("AA") ? "BB" : "AA"}`
    expect(() => decryptPersonal(tampered)).toThrow()
  })

  it("uses DATA_ENCRYPTION_KEY and does not read values of another key", () => {
    const devValue = encryptPersonal("12345678909")
    vi.stubEnv("DATA_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"))
    const keyed = encryptPersonal("12345678909")
    expect(keyed).not.toBe(devValue)
    expect(decryptPersonal(keyed)).toBe("12345678909")
    expect(() => decryptPersonal(devValue)).toThrow()
  })

  it("requires the key in production and a 32 byte key", () => {
    vi.stubEnv("DATA_ENCRYPTION_KEY", "")
    vi.stubEnv("NODE_ENV", "production")
    expect(() => encryptPersonal("12345678909")).toThrow(/not set/)
    vi.stubEnv("DATA_ENCRYPTION_KEY", Buffer.alloc(16).toString("base64"))
    expect(() => encryptPersonal("12345678909")).toThrow(/32 bytes/)
  })
})
