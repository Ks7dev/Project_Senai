import { beforeEach, describe, expect, it, vi } from "vitest"
import { APIError } from "better-auth/api"

const api = {
  signUpEmail: vi.fn(),
  signInEmail: vi.fn(),
  resetPassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  verifyTOTP: vi.fn(),
}
const userFindUnique = vi.fn()
const organizationFindUnique = vi.fn()
const organizationCreate = vi.fn()
const memberCreate = vi.fn()

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/features/shared/lib/auth/auth", () => ({ getAuth: () => ({ api }) }))
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    user: { findUnique: (a: unknown) => userFindUnique(a) },
    organization: { findUnique: (a: unknown) => organizationFindUnique(a) },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        organization: { create: (a: unknown) => organizationCreate(a) },
        member: { create: (a: unknown) => memberCreate(a) },
      }),
  },
}))

const { signUp } = await import("@/features/access/sign-up/action/sign-up")
const { signIn } = await import("@/features/access/sign-in/action/sign-in")
const { resetPassword, requestPasswordReset } =
  await import("@/features/access/password-reset/action/password-reset")

const pf = {
  personType: "PF" as const,
  name: "Cliente Fictício",
  email: "cliente@exemplo.test",
  password: "senha-segura-123",
  confirmPassword: "senha-segura-123",
  acceptTerms: true as const,
  cpf: "900.000.001-75",
}

const pj = {
  ...pf,
  personType: "PJ" as const,
  cnpj: "98.765.432/0001-98",
  legalName: "Empresa Fictícia Ltda.",
  phone: "11987654321",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  userFindUnique.mockResolvedValue(null)
  organizationFindUnique.mockResolvedValue(null)
  api.signUpEmail.mockResolvedValue({ user: { id: "user-1" } })
  organizationCreate.mockResolvedValue({ id: "org-1" })
})

describe("signUp (RF39)", () => {
  it("creates a PF account with the CPF digits as document", async () => {
    expect(await signUp(pf)).toEqual({ success: true })
    expect(api.signUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          personType: "PF",
          document: "90000000175",
          password: "senha-segura-123",
        }),
      })
    )
    expect(organizationCreate).not.toHaveBeenCalled()
  })

  it("creates the corporate account and makes the user its admin (RN08)", async () => {
    expect(await signUp(pj)).toEqual({ success: true })
    expect(organizationCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cnpj: "98765432000198" }),
      })
    )
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          userId: "user-1",
          role: "admin",
        }),
      })
    )
  })

  it("refuses a CPF that already has an account", async () => {
    userFindUnique.mockResolvedValue({ id: "other" })
    expect(await signUp(pf)).toEqual({
      success: false,
      error: "Este CPF já tem cadastro.",
    })
    expect(api.signUpEmail).not.toHaveBeenCalled()
  })

  it("refuses a CNPJ that already has a corporate account", async () => {
    organizationFindUnique.mockResolvedValue({ id: "org" })
    const result = await signUp(pj)
    expect(result.success).toBe(false)
    expect(api.signUpEmail).not.toHaveBeenCalled()
  })

  it("rejects invalid input before touching the database", async () => {
    const result = await signUp({ ...pf, cpf: "111.111.111-11" })
    expect(result).toEqual({
      success: false,
      error: "Revise os dados do formulário.",
    })
    expect(userFindUnique).not.toHaveBeenCalled()
  })
})

describe("signIn (RF39, RF40)", () => {
  it("reports when the account requires the 2FA code", async () => {
    api.signInEmail.mockResolvedValue({ twoFactorRedirect: true })
    expect(
      await signIn({ email: "a@b.test", password: "senha-segura-123" })
    ).toEqual({ success: true, twoFactor: true })
  })

  it("uses the same message for unknown e-mail and wrong password", async () => {
    api.signInEmail.mockRejectedValue(new APIError("UNAUTHORIZED"))
    expect(
      await signIn({ email: "a@b.test", password: "senha-errada-123" })
    ).toEqual({ success: false, error: "E-mail ou senha incorretos." })
  })
})

describe("password reset (RF40)", () => {
  it("answers success even when the e-mail has no account", async () => {
    api.requestPasswordReset.mockResolvedValue({ status: true })
    expect(await requestPasswordReset({ email: "nao@existe.test" })).toEqual({
      success: true,
    })
  })

  it("explains when the token expired or was already used", async () => {
    api.resetPassword.mockRejectedValue(new APIError("BAD_REQUEST"))
    expect(
      await resetPassword({
        token: "used-token",
        password: "nova-senha-123",
        confirmPassword: "nova-senha-123",
      })
    ).toEqual({
      success: false,
      error: "Este link expirou ou já foi usado. Peça um novo link.",
    })
  })
})
