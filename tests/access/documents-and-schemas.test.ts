import { describe, expect, it } from "vitest"
import { signUpSchema } from "@/features/access/sign-up/schema/sign-up-schema"
import { resetPasswordSchema } from "@/features/access/password-reset/schema/password-reset-schema"
import {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  safeRedirectPath,
} from "@/features/shared/lib/validation/documents"
import { accounts, corporateAccount } from "@/prisma/seed-data"

describe("CPF and CNPJ validation (RF39)", () => {
  it("accepts valid documents with or without punctuation", () => {
    expect(isValidCpf("900.000.001-75")).toBe(true)
    expect(isValidCpf("90000000175")).toBe(true)
    expect(isValidCnpj("98.765.432/0001-98")).toBe(true)
  })

  it("rejects wrong check digits, wrong length and repeated digits", () => {
    expect(isValidCpf("900.000.001-76")).toBe(false)
    expect(isValidCpf("1234567890")).toBe(false)
    expect(isValidCpf("111.111.111-11")).toBe(false)
    expect(isValidCnpj("98.765.432/0001-99")).toBe(false)
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false)
  })

  it("formats documents for display", () => {
    expect(formatCpf("90000000175")).toBe("900.000.001-75")
    expect(formatCnpj("98765432000198")).toBe("98.765.432/0001-98")
  })

  it("keeps the seed documents valid", () => {
    for (const account of accounts) {
      expect(isValidCpf(account.document)).toBe(true)
    }
    expect(isValidCnpj(corporateAccount.cnpj)).toBe(true)
  })
})

describe("safeRedirectPath", () => {
  it("keeps internal paths", () => {
    expect(safeRedirectPath("/conta/pedidos")).toBe("/conta/pedidos")
  })

  it("blocks other sites and odd schemes", () => {
    expect(safeRedirectPath("https://evil.example")).toBe("/conta")
    expect(safeRedirectPath("//evil.example")).toBe("/conta")
    expect(safeRedirectPath("/\\evil.example")).toBe("/conta")
    expect(safeRedirectPath(undefined)).toBe("/conta")
  })
})

const base = {
  name: "Cliente Fictício",
  email: "Cliente@Exemplo.test ",
  password: "senha-segura-123",
  confirmPassword: "senha-segura-123",
  acceptTerms: true as const,
  cpf: "900.000.001-75",
}

describe("sign-up schema (RF39)", () => {
  it("accepts a PF with CPF and normalizes e-mail and document", () => {
    const result = signUpSchema.safeParse({ ...base, personType: "PF" })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe("cliente@exemplo.test")
      expect(result.data.cpf).toBe("90000000175")
    }
  })

  it("requires CNPJ, legal name and phone for PJ", () => {
    const result = signUpSchema.safeParse({ ...base, personType: "PJ" })
    expect(result.success).toBe(false)
    const paths = result.error!.issues.map((issue) => issue.path[0])
    expect(paths).toEqual(expect.arrayContaining(["cnpj", "legalName"]))
  })

  it("accepts a complete PJ", () => {
    const result = signUpSchema.safeParse({
      ...base,
      personType: "PJ",
      cnpj: "98.765.432/0001-98",
      legalName: "Empresa Fictícia Ltda.",
      phone: "(11) 98765-4321",
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid CPF, short password, mismatch and missing terms", () => {
    const result = signUpSchema.safeParse({
      ...base,
      personType: "PF",
      cpf: "123.456.789-00",
      password: "curta",
      confirmPassword: "outra",
      acceptTerms: false,
    })
    expect(result.success).toBe(false)
    const paths = result.error!.issues.map((issue) => issue.path[0])
    expect(paths).toEqual(
      expect.arrayContaining(["cpf", "password", "acceptTerms"])
    )
  })
})

describe("reset password schema (RF40)", () => {
  it("requires matching passwords with at least 10 characters", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "nova-senha-123",
        confirmPassword: "nova-senha-124",
      }).success
    ).toBe(false)
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "nova-senha-123",
        confirmPassword: "nova-senha-123",
      }).success
    ).toBe(true)
  })
})
