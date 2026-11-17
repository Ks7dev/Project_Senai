import { describe, expect, it, vi } from "vitest"
import {
  databaseTlsMode,
  mariaDbConfig,
} from "@/features/shared/lib/db/connection-config"

const URL_ = "mysql://atelier_app:p%40ss@db:3307/atelier_bureau"

describe("database connection config", () => {
  it("parses the URL and requires TLS by default (RNF16)", () => {
    expect(mariaDbConfig(URL_, {})).toEqual({
      host: "db",
      port: 3307,
      user: "atelier_app",
      password: "p@ss",
      database: "atelier_bureau",
      connectionLimit: 10,
      ssl: { rejectUnauthorized: false },
    })
  })

  it("uses the default port and the connection_limit parameter", () => {
    const config = mariaDbConfig(
      "mysql://u:p@localhost/atelier_bureau?connection_limit=5",
      {}
    )
    expect(config.port).toBe(3306)
    expect(config.connectionLimit).toBe(5)
  })

  it("rejects other protocols", () => {
    expect(() => mariaDbConfig("postgres://u:p@h/db", {})).toThrow()
  })

  it("only allows RSA key retrieval with TLS disabled", () => {
    const config = mariaDbConfig(URL_, { DATABASE_TLS: "disabled" })
    expect(config.ssl).toBeUndefined()
    expect(config.allowPublicKeyRetrieval).toBe(true)
    expect(mariaDbConfig(URL_, {}).allowPublicKeyRetrieval).toBeUndefined()
  })

  it("verifies the server certificate against the CA file", () => {
    const readCa = vi.fn().mockReturnValue("-----BEGIN CERTIFICATE-----")
    const config = mariaDbConfig(
      URL_,
      { DATABASE_TLS: "verify", DATABASE_TLS_CA: "/certs/ca.pem" },
      readCa
    )
    expect(readCa).toHaveBeenCalledWith("/certs/ca.pem")
    expect(config.ssl).toEqual({
      rejectUnauthorized: true,
      ca: "-----BEGIN CERTIFICATE-----",
    })
  })

  it("refuses verify without a CA file", () => {
    expect(() => mariaDbConfig(URL_, { DATABASE_TLS: "verify" })).toThrow(
      /DATABASE_TLS_CA/
    )
  })

  it("reads the TLS mode case-insensitively and refuses unknown values", () => {
    expect(databaseTlsMode({})).toBe("required")
    expect(databaseTlsMode({ DATABASE_TLS: " Verify " })).toBe("verify")
    expect(() => databaseTlsMode({ DATABASE_TLS: "off" })).toThrow(
      /DATABASE_TLS must be one of/
    )
  })
})
