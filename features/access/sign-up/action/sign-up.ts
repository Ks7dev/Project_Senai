"use server"

import { headers } from "next/headers"
import { randomUUID } from "node:crypto"
import { isAPIError } from "better-auth/api"
import {
  signUpSchema,
  type SignUpInput,
} from "@/features/access/sign-up/schema/sign-up-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import { serializeRoles } from "@/features/shared/lib/auth/corporate-roles"
import { lookupCnpj } from "@/features/shared/lib/brasilapi/cnpj"
import { prisma } from "@/features/shared/lib/db/prisma"
import { isValidCnpj } from "@/features/shared/lib/validation/documents"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Creates a PF or PJ account (RF39). The password is hashed by Better
 * Auth and the session cookie is set on success. For PJ it also creates
 * the corporate account, after checking the CNPJ status (RF09), with the
 * user as administrator and approver (RN08).
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
      // RF09: registration status checked at the Receita Federal data
      const lookup = await lookupCnpj(data.cnpj)
      if (lookup.status === "not_found") {
        throw new AppError(
          "CNPJ não encontrado na Receita Federal. Confira o número.",
          "cnpj_not_found"
        )
      }
      if (lookup.status === "inactive") {
        throw new AppError(
          `O CNPJ está com situação cadastral "${lookup.situation}". Só empresas ativas podem abrir conta.`,
          "cnpj_inactive"
        )
      }
      if (lookup.status === "active") data.legalName = lookup.legalName
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
            role: serializeRoles(["admin", "approver"]),
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

/** Public CNPJ data used to fill the sign-up form (RF09). */
export type CnpjFormData =
  | { found: true; active: boolean; legalName: string; situation?: string }
  | { found: false; unavailable: boolean }

/**
 * Looks up a CNPJ while the user types, to fill the legal name and warn
 * about inactive companies (RF09). The check is repeated in signUp.
 *
 * @param input - CNPJ typed in the form.
 * @returns `{ success: true, data }` or `{ success: false, error }`.
 */
export async function lookupCnpjForSignUp(input: {
  cnpj: string
}): Promise<ActionResult<{ data: CnpjFormData }>> {
  try {
    const cnpj = String(input?.cnpj ?? "")
    if (!isValidCnpj(cnpj)) throw new AppError("CNPJ inválido.", "invalid")
    const lookup = await lookupCnpj(cnpj)
    if (lookup.status === "active") {
      return {
        success: true,
        data: { found: true, active: true, legalName: lookup.legalName },
      }
    }
    if (lookup.status === "inactive") {
      return {
        success: true,
        data: {
          found: true,
          active: false,
          legalName: lookup.legalName,
          situation: lookup.situation,
        },
      }
    }
    return {
      success: true,
      data: { found: false, unavailable: lookup.status === "unavailable" },
    }
  } catch (error) {
    return toActionError(error, { action: "lookupCnpjForSignUp" })
  }
}
