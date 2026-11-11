import "server-only"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@/generated/prisma/client"

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
  return new PrismaClient({ adapter: new PrismaMariaDb(url) })
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>
}

/**
 * Single Prisma client for the whole server. Reused across hot reloads
 * in development to avoid opening a new pool on every change.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
