import { beforeEach, describe, expect, it, vi } from "vitest"

const getCurrentUser = vi.fn()
const memberFindFirst = vi.fn()
const memberFindMany = vi.fn()
const memberUpdate = vi.fn()
const memberDelete = vi.fn()
const memberCreate = vi.fn()
const invitationCreate = vi.fn()
const invitationFindUnique = vi.fn()
const invitationUpdate = vi.fn()
const sendEmail = vi.fn()

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/features/shared/lib/auth/auth", () => ({ getAuth: () => ({}) }))
vi.mock("@/features/shared/lib/auth/session", () => ({
  getCurrentUser: () => getCurrentUser(),
}))
vi.mock("@/features/shared/lib/email/mailer", () => ({
  sendEmail: (m: unknown) => sendEmail(m),
}))
const tx = {
  member: {
    findMany: (a: unknown) => memberFindMany(a),
    findFirst: (a: unknown) => memberFindFirst(a),
    update: (a: unknown) => memberUpdate(a),
    delete: (a: unknown) => memberDelete(a),
    create: (a: unknown) => memberCreate(a),
  },
  invitation: {
    updateMany: vi.fn(),
    create: (a: unknown) => invitationCreate(a),
    findUnique: (a: unknown) => invitationFindUnique(a),
    update: (a: unknown) => invitationUpdate(a),
  },
  auditLog: { create: vi.fn() },
}
vi.mock("@/features/shared/lib/db/prisma", () => ({
  prisma: {
    ...tx,
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  },
}))

const { inviteMember, updateMemberRoles, removeMember, acceptInvitation } =
  await import("@/features/access/corporate-members/action/members-actions")

const admin = { id: "u-admin", name: "Admin", email: "admin@empresa.test" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "info").mockImplementation(() => {})
  getCurrentUser.mockResolvedValue(admin)
  // first call: corporate context of the logged-in admin
  memberFindFirst.mockImplementation(async (args: { where: object }) =>
    "organization" in args.where
      ? { organizationId: "org-1", role: "approver,admin" }
      : null
  )
  memberFindMany.mockResolvedValue([
    { id: "m1", userId: "u-admin", role: "approver,admin" },
    { id: "m2", userId: "u2", role: "requester" },
  ])
  invitationCreate.mockResolvedValue({
    id: "inv-1",
    organization: { name: "Empresa Fictícia" },
  })
})

describe("inviteMember (#34)", () => {
  it("creates a 7-day invitation and e-mails the link", async () => {
    expect(
      await inviteMember({ email: "Nova@Empresa.test", roles: ["requester"] })
    ).toEqual({ success: true })
    const data = invitationCreate.mock.calls[0][0].data
    expect(data).toMatchObject({
      email: "nova@empresa.test",
      role: "requester",
      status: "pending",
      organizationId: "org-1",
    })
    const days = (data.expiresAt.getTime() - Date.now()) / 86_400_000
    expect(Math.round(days)).toBe(7)
    expect(sendEmail.mock.calls[0][0].text).toContain("/convite/inv-1")
  })

  it("is only allowed for account administrators (RF10)", async () => {
    memberFindFirst.mockImplementation(async (args: { where: object }) =>
      "organization" in args.where
        ? { organizationId: "org-1", role: "requester" }
        : null
    )
    expect(
      await inviteMember({ email: "x@empresa.test", roles: ["requester"] })
    ).toEqual({
      success: false,
      error: "Você não tem permissão para esta ação.",
    })
    expect(invitationCreate).not.toHaveBeenCalled()
  })
})

describe("member roles and RN08 (#35)", () => {
  it("refuses to leave a multi-user account without an approver", async () => {
    const result = await updateMemberRoles({
      memberId: "m1",
      roles: ["admin"],
    })
    expect(result).toEqual({
      success: false,
      error:
        "Contas com mais de um usuário precisam de pelo menos um aprovador.",
    })
    expect(memberUpdate).not.toHaveBeenCalled()
  })

  it("saves a valid role change", async () => {
    expect(
      await updateMemberRoles({ memberId: "m2", roles: ["finance"] })
    ).toEqual({ success: true })
    expect(memberUpdate).toHaveBeenCalledWith({
      where: { id: "m2" },
      data: { role: "finance" },
    })
  })

  it("gives the remaining single user admin and approver on removal", async () => {
    memberFindMany.mockResolvedValue([
      { id: "m1", userId: "u-admin", role: "admin" },
      { id: "m2", userId: "u2", role: "approver" },
    ])
    expect(await removeMember({ id: "m2" })).toEqual({ success: true })
    expect(memberDelete).toHaveBeenCalledWith({ where: { id: "m2" } })
    expect(memberUpdate).toHaveBeenCalledWith({
      where: { id: "m1" },
      data: { role: "approver,admin" },
    })
  })

  it("does not let users remove themselves", async () => {
    expect((await removeMember({ id: "m1" })).success).toBe(false)
  })
})

describe("acceptInvitation (#34)", () => {
  it("links the logged-in user with the invited e-mail", async () => {
    getCurrentUser.mockResolvedValue({
      id: "u3",
      name: "Novo",
      email: "nova@empresa.test",
    })
    invitationFindUnique.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-1",
      email: "nova@empresa.test",
      role: "requester",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect(await acceptInvitation({ id: "inv-1" })).toEqual({ success: true })
    expect(memberCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org-1",
          userId: "u3",
          role: "requester",
        }),
      })
    )
  })

  it("refuses expired invitations and other e-mails", async () => {
    getCurrentUser.mockResolvedValue({
      id: "u3",
      name: "Outro",
      email: "outro@empresa.test",
    })
    invitationFindUnique.mockResolvedValue({
      id: "inv-1",
      organizationId: "org-1",
      email: "nova@empresa.test",
      role: "requester",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
    })
    expect((await acceptInvitation({ id: "inv-1" })).success).toBe(false)
    expect(memberCreate).not.toHaveBeenCalled()
  })
})
