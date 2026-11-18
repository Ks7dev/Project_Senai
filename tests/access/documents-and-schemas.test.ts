import { describe, expect, it } from "vitest"
import { signUpSchema } from "@/features/access/sign-up/schema/sign-up-schema"
import { resetPasswordSchema } from "@/features/access/password-reset/schema/password-reset-schema"
import {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  isValidPhone,
  maskCnpj,
  maskCpf,
  maskPhone,
  safeRedirectPath,
} from "@/features/shared/lib/validation/documents"
import { newPasswordSchema } from "@/features/shared/schema/password-schema"
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
  password: "Senha-segura-123",
  confirmPassword: "Senha-segura-123",
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

  it("rejects an invalid phone for PJ", () => {
    const result = signUpSchema.safeParse({
      ...base,
      personType: "PJ",
      cnpj: "98.765.432/0001-98",
      legalName: "Empresa Fictícia Ltda.",
      phone: "(11) 8765-432",
    })
    expect(result.success).toBe(false)
    const paths = result.error!.issues.map((issue) => issue.path[0])
    expect(paths).toEqual(["phone"])
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
  it("requires matching passwords that follow the policy", () => {
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "Nova-senha-123",
        confirmPassword: "Nova-senha-124",
      }).success
    ).toBe(false)
    expect(
      resetPasswordSchema.safeParse({
        token: "t",
        password: "Nova-senha-123",
        confirmPassword: "Nova-senha-123",
      }).success
    ).toBe(true)
  })
})

describe("phone validation", () => {
  it("accepts mobiles and landlines with a valid DDD", () => {
    expect(isValidPhone("(11) 98765-4321")).toBe(true)
    expect(isValidPhone("(21) 3456-7890")).toBe(true)
  })

  it("rejects wrong length, unknown DDD, wrong prefix and repeated digits", () => {
    expect(isValidPhone("(11) 8765-432")).toBe(false)
    expect(isValidPhone("(11) 98765-43210")).toBe(false)
    expect(isValidPhone("(20) 98765-4321")).toBe(false)
    expect(isValidPhone("(11) 88765-4321")).toBe(false)
    expect(isValidPhone("(11) 9765-4321")).toBe(false)
    expect(isValidPhone("11111111111")).toBe(false)
  })
})

describe("input masks", () => {
  it("formats while typing and drops extra digits", () => {
    expect(maskCpf("9000")).toBe("900.0")
    expect(maskCpf("900000001751234")).toBe("900.000.001-75")
    expect(maskCnpj("98765432000198")).toBe("98.765.432/0001-98")
    expect(maskPhone("1134")).toBe("(11) 34")
    expect(maskPhone("1134567890")).toBe("(11) 3456-7890")
    expect(maskPhone("119876543210")).toBe("(11) 98765-4321")
  })

  it("ignores letters and symbols", () => {
    expect(maskCpf("abc9.0.0")).toBe("900")
    expect(maskPhone("tel: 11")).toBe("(11")
  })
})

describe("new password policy", () => {
  const messages = (password: string) =>
    newPasswordSchema.safeParse(password).error?.issues.map((i) => i.message)

  it("accepts a password with every required kind of character", () => {
    expect(newPasswordSchema.safeParse("Senha-segura-123").success).toBe(true)
    expect(newPasswordSchema.safeParse("Átrio#cadeira9").success).toBe(true)
  })

  it("names each missing rule", () => {
    expect(messages("senha-segura-123")).toEqual([
      "Inclua pelo menos uma letra maiúscula.",
    ])
    expect(messages("SENHA-SEGURA-123")).toEqual([
      "Inclua pelo menos uma letra minúscula.",
    ])
    expect(messages("Senha-segura-abc")).toEqual([
      "Inclua pelo menos um número.",
    ])
    expect(messages("SenhaSegura123")).toEqual([
      "Inclua pelo menos um caractere especial.",
    ])
    expect(messages("Ab1!")).toEqual(["Use pelo menos 10 caracteres."])
  })
})
