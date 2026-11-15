import "server-only"
import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { nextCookies } from "better-auth/next-js"
import { organization, twoFactor } from "better-auth/plugins"
import { passwordResetLink } from "@/features/shared/lib/auth/reset-link"
import { getPrisma } from "@/features/shared/lib/db/prisma"
import { sendEmail } from "@/features/shared/lib/email/mailer"

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
      // Reset token expires in 1 hour and is consumed on use (RF40)
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const url = passwordResetLink(process.env.BETTER_AUTH_URL, token)
        await sendEmail({
          to: user.email,
          subject: "Redefinição de senha — Atelier Bureau",
          text: [
            `Olá, ${user.name}.`,
            "Recebemos um pedido para redefinir a senha da sua conta.",
            `Use este link em até 1 hora: ${url}`,
            "Se não foi você, ignore este e-mail; a senha continua a mesma.",
          ].join("\n\n"),
        })
      },
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
