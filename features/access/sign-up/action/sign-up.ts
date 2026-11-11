"use server"

import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { isAPIError } from "better-auth/api"
import {
  signUpSchema,
  type SignUpInput,
} from "@/features/access/sign-up/schema/sign-up-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Creates a PF or PJ account (RF39). The password is hashed by Better
 * Auth and the session cookie is set on success. For PJ it also creates
 * the corporate account with the user as administrator (RN08).
 *
 * @param input - Sign-up form values, revalidated here with Zod.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function signUp(input: SignUpInput): Promise<ActionResult> {
  try {
    const parsed = signUpSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os dados do formulário.", "invalid_input")
    }
    const data = parsed.data

    const cpfInUse = await prisma.user.findUnique({
      where: { document: data.cpf },
      select: { id: true },
    })
    if (cpfInUse) throw new AppError("Este CPF já tem cadastro.", "cpf_in_use")

    if (data.personType === "PJ") {
      const cnpjInUse = await prisma.organization.findUnique({
        where: { cnpj: data.cnpj },
        select: { id: true },
      })
      if (cnpjInUse) {
        throw new AppError(
          "Este CNPJ já tem uma conta. Peça um convite ao administrador da empresa.",
          "cnpj_in_use"
        )
      }
    }

    const result = await getAuth()
      .api.signUpEmail({
        headers: await headers(),
        body: {
          name: data.name,
          email: data.email,
          password: data.password,
          personType: data.personType,
          document: data.cpf,
          phone: data.phone,
        },
      })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError(
            "Não foi possível criar a conta. Verifique se o e-mail já está cadastrado.",
            "sign_up_rejected"
          )
        }
        throw error
      })

    if (data.personType === "PJ") {
      const now = new Date()
      await prisma.$transaction(async (tx) => {
        const organization = await tx.organization.create({
          data: {
            id: randomUUID(),
            name: data.legalName,
            slug: `pj-${data.cnpj}`,
            cnpj: data.cnpj,
            legalName: data.legalName,
            createdAt: now,
          },
        })
        await tx.member.create({
          data: {
            id: randomUUID(),
            organizationId: organization.id,
            userId: result.user.id,
            role: "admin",
            createdAt: now,
          },
        })
      })
    }

    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "signUp" })
  }
}
