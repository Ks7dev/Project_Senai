import { readFileSync } from "node:fs"
import type { PrismaMariaDb } from "@prisma/adapter-mariadb"

/** Connection options accepted by the MariaDB driver adapter. */
export type MariaDbConfig = Extract<
  ConstructorParameters<typeof PrismaMariaDb>[0],
  { connectionLimit?: number }
>

/**
 * TLS mode of the app connection to MySQL (`DATABASE_TLS`, RNF16):
 * - `required` (default): encrypted connection, certificate not
 *   verified. Works with the self-signed certificate MySQL generates in
 *   the container.
 * - `verify`: encrypted and the server certificate is checked against
 *   the CA file in `DATABASE_TLS_CA` (e.g. the `ca.pem` of the volume).
 * - `disabled`: plain connection, only for a local MySQL without TLS.
 */
export type DatabaseTlsMode = "required" | "verify" | "disabled"

/** Environment variables read by the connection config. */
export type Environment = Readonly<Record<string, string | undefined>>

const TLS_MODES: readonly DatabaseTlsMode[] = ["required", "verify", "disabled"]

/**
 * Reads the TLS mode from the environment.
 *
 * @param env - Environment variables (defaults to `process.env`).
 * @returns The mode; `required` when unset.
 * @throws Error when `DATABASE_TLS` has an unknown value.
 */
export function databaseTlsMode(
  env: Environment = process.env
): DatabaseTlsMode {
  const value = (env.DATABASE_TLS ?? "").trim().toLowerCase()
  if (!value) return "required"
  if ((TLS_MODES as readonly string[]).includes(value)) {
    return value as DatabaseTlsMode
  }
  throw new Error(
    `DATABASE_TLS must be one of ${TLS_MODES.join(", ")} (got "${value}")`
  )
}

/**
 * Converts a `mysql://user:password@host:port/database` URL into the
 * MariaDB driver options used with MySQL 8.
 *
 * The connection is encrypted by default (`DATABASE_TLS`, RNF16). Only
 * with TLS disabled, the first login of a `caching_sha2_password` user
 * needs the server RSA public key, which the driver refuses to fetch by
 * default (ER_CANNOT_RETRIEVE_RSA_KEY), so `allowPublicKeyRetrieval` is
 * enabled in that mode alone; over TLS the password travels encrypted.
 *
 * @param url - Database URL from the environment.
 * @param env - Environment variables (defaults to `process.env`).
 * @param readCa - Reads the CA file (injectable for tests).
 * @returns Driver options.
 * @throws Error on an invalid URL, TLS mode or missing CA file.
 */
export function mariaDbConfig(
  url: string,
  env: Environment = process.env,
  readCa: (path: string) => string = (path) => readFileSync(path, "utf8")
): MariaDbConfig {
  const parsed = new URL(url)
  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    throw new Error("Database URL must start with mysql://")
  }
  const limit = Number(parsed.searchParams.get("connection_limit") ?? 10)
  const base = {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    connectionLimit: Number.isInteger(limit) && limit > 0 ? limit : 10,
  }

  const mode = databaseTlsMode(env)
  if (mode === "disabled") return { ...base, allowPublicKeyRetrieval: true }
  if (mode === "required") {
    return { ...base, ssl: { rejectUnauthorized: false } }
  }
  const caPath = env.DATABASE_TLS_CA?.trim()
  if (!caPath) {
    throw new Error("DATABASE_TLS=verify needs DATABASE_TLS_CA (CA file path)")
  }
  return { ...base, ssl: { rejectUnauthorized: true, ca: readCa(caPath) } }
}
