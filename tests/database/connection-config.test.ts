import { describe, expect, it } from "vitest"
import { mariaDbConfig } from "@/features/shared/lib/db/connection-config"

describe("database connection config", () => {
  it("parses the URL and enables RSA key retrieval for MySQL 8", () => {
    expect(
      mariaDbConfig("mysql://atelier_app:p%40ss@db:3307/atelier_bureau")
    ).toEqual({
      host: "db",
      port: 3307,
      user: "atelier_app",
      password: "p@ss",
      database: "atelier_bureau",
      allowPublicKeyRetrieval: true,
      connectionLimit: 10,
    })
  })

  it("uses the default port and the connection_limit parameter", () => {
    const config = mariaDbConfig(
      "mysql://u:p@localhost/atelier_bureau?connection_limit=5"
    )
    expect(config.port).toBe(3306)
    expect(config.connectionLimit).toBe(5)
  })

  it("rejects other protocols", () => {
    expect(() => mariaDbConfig("postgres://u:p@h/db")).toThrow()
  })
})
