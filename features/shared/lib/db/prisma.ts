import "server-only"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@/generated/prisma/client"
import { mariaDbConfig } from "@/features/shared/lib/db/connection-config"

/**
 * Creates the Prisma client connected to MySQL 8 through the MariaDB
 * driver adapter (works with MySQL). Reads DATABASE_URL, the app user
 * without DDL permission.
 *
 * @returns A new Prisma client.
 */
function createPrismaClient() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("DATABASE_URL is not set")
  return new PrismaClient({ adapter: new PrismaMariaDb(mariaDbConfig(url)) })
}

type Client = ReturnType<typeof createPrismaClient>

const globalForPrisma = globalThis as unknown as { prisma?: Client }

/**
 * Returns the single Prisma client, creating it on first use. Lazy so
 * that importing this module (e.g. during `next build`) needs no
 * database. Reused across hot reloads in development.
 *
 * @returns The Prisma client.
 */
export function getPrisma(): Client {
  if (!globalForPrisma.prisma) globalForPrisma.prisma = createPrismaClient()
  return globalForPrisma.prisma
}

/** Single Prisma client for the whole server (created on first use). */
export const prisma = new Proxy({} as Client, {
  get(_target, property) {
    const client = getPrisma()
    const value = Reflect.get(client, property, client)
    return typeof value === "function" ? value.bind(client) : value
  },
})
