import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  applyApproverRule,
  hasCorporatePermission,
  parseRoles,
  serializeRoles,
} from "@/features/shared/lib/auth/corporate-roles"

describe("corporate roles (RF10)", () => {
  it("parses stored roles and ignores unknown values", () => {
    expect(parseRoles("admin, approver,owner,admin")).toEqual([
      "admin",
      "approver",
    ])
    expect(parseRoles(null)).toEqual([])
  })

  it("serializes roles in a stable order", () => {
    expect(serializeRoles(["admin", "requester", "approver"])).toBe(
      "requester,approver,admin"
    )
  })

  it("grants permissions by role", () => {
    expect(hasCorporatePermission(["requester"], "order:create")).toBe(true)
    expect(hasCorporatePermission(["requester"], "order:approve")).toBe(false)
    expect(hasCorporatePermission(["approver"], "order:approve")).toBe(true)
    expect(hasCorporatePermission(["finance"], "finance:read")).toBe(true)
    expect(hasCorporatePermission(["admin"], "member:manage")).toBe(true)
    expect(hasCorporatePermission(["requester"], "member:manage")).toBe(false)
  })
})

describe("RN08", () => {
  it("gives a single user both administrator and approver", () => {
    expect(applyApproverRule([{ userId: "u1", roles: ["requester"] }])).toEqual(
      {
        members: [{ userId: "u1", roles: ["requester", "admin", "approver"] }],
      }
    )
  })

  it("requires an approver in multi-user accounts", () => {
    const result = applyApproverRule([
      { userId: "u1", roles: ["admin"] },
      { userId: "u2", roles: ["requester"] },
    ])
    expect(result).toEqual({
      error:
        "Contas com mais de um usuário precisam de pelo menos um aprovador.",
    })
  })

  it("requires an administrator in multi-user accounts", () => {
    expect(
      applyApproverRule([
        { userId: "u1", roles: ["approver"] },
        { userId: "u2", roles: ["requester"] },
      ])
    ).toHaveProperty("error")
  })

  it("accepts a multi-user account with approver and administrator", () => {
    const members = [
      { userId: "u1", roles: ["admin" as const] },
      { userId: "u2", roles: ["approver" as const] },
    ]
    expect(applyApproverRule(members)).toEqual({ members })
  })
})

describe("BrasilAPI CNPJ lookup (RF09)", async () => {
  const { lookupCnpj } = await import("@/features/shared/lib/brasilapi/cnpj")
  const reply = (status: number, body?: unknown) =>
    vi
      .fn()
      .mockResolvedValue(
        new Response(body ? JSON.stringify(body) : null, { status })
      ) as unknown as typeof fetch

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {})
  })

  it("returns the legal name of an active company", async () => {
    const fetcher = reply(200, {
      razao_social: "EMPRESA FICTICIA LTDA",
      nome_fantasia: "Fictícia",
      descricao_situacao_cadastral: "ATIVA",
    })
    expect(await lookupCnpj("98.765.432/0001-98", fetcher)).toEqual({
      status: "active",
      legalName: "EMPRESA FICTICIA LTDA",
      tradeName: "Fictícia",
    })
    expect(fetcher).toHaveBeenCalledWith(
      "https://brasilapi.com.br/api/cnpj/v1/98765432000198",
      expect.anything()
    )
  })

  it("flags inactive companies", async () => {
    const result = await lookupCnpj(
      "98765432000198",
      reply(200, {
        razao_social: "X",
        descricao_situacao_cadastral: "BAIXADA",
      })
    )
    expect(result).toEqual({
      status: "inactive",
      legalName: "X",
      situation: "BAIXADA",
    })
  })

  it("reports not found and falls back when the API fails", async () => {
    expect(await lookupCnpj("98765432000198", reply(404))).toEqual({
      status: "not_found",
    })
    expect(await lookupCnpj("98765432000198", reply(500))).toEqual({
      status: "unavailable",
    })
    const failing = vi
      .fn()
      .mockRejectedValue(new Error("timeout")) as unknown as typeof fetch
    expect(await lookupCnpj("98765432000198", failing)).toEqual({
      status: "unavailable",
    })
  })
})
