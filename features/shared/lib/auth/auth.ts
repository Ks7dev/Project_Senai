import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { organization, twoFactor } from "better-auth/plugins"
import { getPrisma } from "@/features/shared/lib/db/prisma"

/**
 * Builds the Better Auth server instance: e-mail and password with
 * hashed passwords, httpOnly session cookie, optional 2FA (RF40) and
 * organizations for multi-user corporate accounts (RF09, RF10).
 *
 * @returns The auth instance.
 */
function createAuth() {
  return betterAuth({
    appName: "Atelier Bureau",
    database: prismaAdapter(getPrisma(), { provider: "mysql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
    user: {
      additionalFields: {
        personType: { type: "string", required: true, input: true },
        document: { type: "string", required: true, input: true },
        phone: { type: "string", required: false, input: true },
      },
    },
    plugins: [
      twoFactor({ issuer: "Atelier Bureau" }),
      organization(),
      nextCookies(),
    ],
  })
}

type Auth = ReturnType<typeof createAuth>

const globalForAuth = globalThis as unknown as { auth?: Auth }

/**
 * Returns the single Better Auth instance, created on first use so the
 * build does not need a database.
 *
 * @returns The auth instance.
 */
export function getAuth(): Auth {
  if (!globalForAuth.auth) globalForAuth.auth = createAuth()
  return globalForAuth.auth
}
