import type { PrismaMariaDb } from "@prisma/adapter-mariadb"

/** Connection options accepted by the MariaDB driver adapter. */
export type MariaDbConfig = Extract<
  ConstructorParameters<typeof PrismaMariaDb>[0],
  { connectionLimit?: number }
>

/**
 * Converts a `mysql://user:password@host:port/database` URL into the
 * MariaDB driver options used with MySQL 8.
 *
 * MySQL 8 authenticates with `caching_sha2_password`. Without TLS, the
 * first login of a user needs the server RSA public key, which the
 * driver refuses to fetch by default (ER_CANNOT_RETRIEVE_RSA_KEY), so
 * `allowPublicKeyRetrieval` is enabled. The database is only reachable
 * inside the Docker network or on localhost.
 *
 * @param url - Database URL from the environment.
 * @returns Driver options.
 */
export function mariaDbConfig(url: string): MariaDbConfig {
  const parsed = new URL(url)
  if (parsed.protocol !== "mysql:" && parsed.protocol !== "mariadb:") {
    throw new Error("Database URL must start with mysql://")
  }
  const limit = Number(parsed.searchParams.get("connection_limit") ?? 10)
  return {
    host: parsed.hostname,
    port: Number(parsed.port || 3306),
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
    allowPublicKeyRetrieval: true,
    connectionLimit: Number.isInteger(limit) && limit > 0 ? limit : 10,
  }
}
