import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { organization, twoFactor } from "better-auth/plugins"
import { prisma } from "@/features/shared/lib/db/prisma"

/**
 * Better Auth server instance: e-mail and password with hashed
 * passwords, httpOnly session cookie, optional 2FA (RF40) and
 * organizations for multi-user corporate accounts (RF09, RF10).
 */
export const auth = betterAuth({
  appName: "Atelier Bureau",
  database: prismaAdapter(prisma, { provider: "mysql" }),
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
