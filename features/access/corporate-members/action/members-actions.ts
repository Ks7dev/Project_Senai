"use server"

import { randomUUID } from "node:crypto"
import { headers } from "next/headers"
import { isAPIError } from "better-auth/api"
import {
  acceptWithSignUpSchema,
  idSchema,
  inviteMemberSchema,
  updateMemberRolesSchema,
  type AcceptWithSignUpInput,
  type IdInput,
  type InviteMemberInput,
  type UpdateMemberRolesInput,
} from "@/features/access/corporate-members/schema/members-schema"
import { getAuth } from "@/features/shared/lib/auth/auth"
import {
  applyApproverRule,
  CORPORATE_ROLES,
  parseRoles,
  serializeRoles,
  type CorporateRole,
  type MemberRoles,
} from "@/features/shared/lib/auth/corporate-roles"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requireCorporatePermission } from "@/features/shared/lib/db/corporate"
import { prisma } from "@/features/shared/lib/db/prisma"
import { sendEmail } from "@/features/shared/lib/email/mailer"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

const INVITATION_DAYS = 7

/** Member row shown on the team page. */
export type TeamMember = {
  id: string
  userId: string
  name: string
  email: string
  roles: CorporateRole[]
  isCurrentUser: boolean
}

/** Pending invitation shown on the team page. */
export type PendingInvitation = {
  id: string
  email: string
  roles: CorporateRole[]
  expiresAt: string
}

/** Team page data. */
export type TeamData = {
  organizationName: string
  members: TeamMember[]
  invitations: PendingInvitation[]
}

/**
 * Lists the members and pending invitations of the user's corporate
 * account (RF09, RF10). Only account administrators may see it.
 *
 * @returns `{ success: true, team }` or `{ success: false, error }`.
 */
export async function getTeam(): Promise<ActionResult<{ team: TeamData }>> {
  try {
    const context = await requireCorporatePermission("member:manage")
    const organization = await prisma.organization.findUniqueOrThrow({
      where: { id: context.organizationId },
      select: {
        name: true,
        members: {
          select: {
            id: true,
            userId: true,
            role: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        invitations: {
          where: { status: "pending", expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        },
      },
    })
    return {
      success: true,
      team: {
        organizationName: organization.name,
        members: organization.members.map((member) => ({
          id: member.id,
          userId: member.userId,
          name: member.user.name,
          email: member.user.email,
          roles: parseRoles(member.role),
          isCurrentUser: member.userId === context.user.id,
        })),
        invitations: organization.invitations.map((invitation) => ({
          id: invitation.id,
          email: invitation.email,
          roles: parseRoles(invitation.role),
          expiresAt: invitation.expiresAt.toISOString(),
        })),
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getTeam" })
  }
}

/**
 * Invites a user by e-mail to the corporate account with the chosen
 * roles (RF09, RF10). The link is valid for 7 days. Inviting the same
 * e-mail again renews the pending invitation.
 *
 * @param input - E-mail and roles.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function inviteMember(
  input: InviteMemberInput
): Promise<ActionResult> {
  try {
    const parsed = inviteMemberSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise o convite.",
        "invalid"
      )
    }
    const context = await requireCorporatePermission("member:manage")
    const { email, roles } = parsed.data

    const alreadyMember = await prisma.member.findFirst({
      where: { organizationId: context.organizationId, user: { email } },
      select: { id: true },
    })
    if (alreadyMember) {
      throw new AppError("Esta pessoa já faz parte da conta.", "already_member")
    }
    const otherAccount = await prisma.member.findFirst({
      where: {
        user: { email },
        organizationId: { not: context.organizationId },
      },
      select: { id: true },
    })
    if (otherAccount) {
      throw new AppError(
        "Este e-mail já está vinculado a outra conta corporativa.",
        "other_organization"
      )
    }

    const expiresAt = new Date(Date.now() + INVITATION_DAYS * 86_400_000)
    const { invitationId, organizationName } = await prisma.$transaction(
      async (tx) => {
        await tx.invitation.updateMany({
          where: {
            organizationId: context.organizationId,
            email,
            status: "pending",
          },
          data: { status: "canceled" },
        })
        const invitation = await tx.invitation.create({
          data: {
            id: randomUUID(),
            organizationId: context.organizationId,
            email,
            role: serializeRoles(roles),
            status: "pending",
            expiresAt,
            inviterId: context.user.id,
          },
          include: { organization: { select: { name: true } } },
        })
        await writeAudit(tx, {
          userId: context.user.id,
          action: "organization.invite",
          entity: "organization",
          entityId: context.organizationId,
          after: { invitationId: invitation.id, roles },
        })
        return {
          invitationId: invitation.id,
          organizationName: invitation.organization.name,
        }
      }
    )

    const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
    await sendEmail({
      to: email,
      subject: `Convite para a conta ${organizationName} — Atelier Bureau`,
      text: [
        `${context.user.name} convidou você para a conta corporativa ${organizationName} na Atelier Bureau.`,
        `Perfis: ${roles.map((role) => CORPORATE_ROLES[role]).join(", ")}.`,
        `Aceite o convite em até ${INVITATION_DAYS} dias: ${baseUrl}/convite/${invitationId}`,
      ].join("\n\n"),
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "inviteMember" })
  }
}

/**
 * Cancels a pending invitation.
 *
 * @param input - Invitation id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function cancelInvitation(input: IdInput): Promise<ActionResult> {
  try {
    const { id } = idSchema.parse(input)
    const context = await requireCorporatePermission("member:manage")
    const result = await prisma.invitation.updateMany({
      where: { id, organizationId: context.organizationId, status: "pending" },
      data: { status: "canceled" },
    })
    if (result.count === 0) {
      throw new AppError("Convite não encontrado.", "not_found")
    }
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "cancelInvitation" })
  }
}

/**
 * Saves the members of an organization after validating RN08 (at least
 * one approver and one administrator in multi-user accounts; a single
 * user holds both).
 *
 * @param organizationId - Corporate account.
 * @param userId - User performing the change.
 * @param change - Function that returns the members after the change.
 * @param action - Audit action name.
 */
async function changeMembers(
  organizationId: string,
  userId: string,
  change: (
    members: Array<MemberRoles & { id: string }>
  ) => Array<MemberRoles & { id: string }>,
  action: string
) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.member.findMany({
      where: { organizationId },
      select: { id: true, userId: true, role: true },
    })
    const before = current.map((m) => ({
      id: m.id,
      userId: m.userId,
      roles: parseRoles(m.role),
    }))
    const after = change(before)
    const checked = applyApproverRule(after)
    if ("error" in checked) throw new AppError(checked.error, "rn08")

    const keep = new Set(after.map((m) => m.id))
    for (const member of before) {
      if (!keep.has(member.id)) {
        await tx.member.delete({ where: { id: member.id } })
      }
    }
    for (const member of after) {
      const roles = checked.members.find(
        (m) => m.userId === member.userId
      )!.roles
      await tx.member.update({
        where: { id: member.id },
        data: { role: serializeRoles(roles) },
      })
    }
    await writeAudit(tx, {
      userId,
      action,
      entity: "organization",
      entityId: organizationId,
      before,
      after: checked.members,
    })
  })
}

/**
 * Changes the roles of a member (RF10). The account must keep at least
 * one approver and one administrator (RN08).
 *
 * @param input - Member id and new roles.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function updateMemberRoles(
  input: UpdateMemberRolesInput
): Promise<ActionResult> {
  try {
    const parsed = updateMemberRolesSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Escolha pelo menos um perfil.", "invalid")
    }
    const context = await requireCorporatePermission("member:manage")
    await changeMembers(
      context.organizationId,
      context.user.id,
      (members) => {
        if (!members.some((m) => m.id === parsed.data.memberId)) {
          throw new AppError("Usuário não encontrado.", "not_found")
        }
        return members.map((m) =>
          m.id === parsed.data.memberId ? { ...m, roles: parsed.data.roles } : m
        )
      },
      "organization.member.roles"
    )
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "updateMemberRoles" })
  }
}

/**
 * Removes a member from the corporate account. The user account stays;
 * only the link to the company is removed. RN08 still applies.
 *
 * @param input - Member id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function removeMember(input: IdInput): Promise<ActionResult> {
  try {
    const { id } = idSchema.parse(input)
    const context = await requireCorporatePermission("member:manage")
    await changeMembers(
      context.organizationId,
      context.user.id,
      (members) => {
        const target = members.find((m) => m.id === id)
        if (!target) throw new AppError("Usuário não encontrado.", "not_found")
        if (target.userId === context.user.id) {
          throw new AppError(
            "Você não pode remover a si mesmo. Peça a outro administrador.",
            "self"
          )
        }
        return members.filter((m) => m.id !== id)
      },
      "organization.member.remove"
    )
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "removeMember" })
  }
}

/** Invitation data shown on the acceptance page. */
export type InvitationView = {
  id: string
  organizationName: string
  email: string
  roles: CorporateRole[]
  /** "accept": logged in with the invited e-mail; "login": the e-mail
   * has an account; "sign-up": no account yet; "wrong-user": logged in
   * with another e-mail. */
  mode: "accept" | "login" | "sign-up" | "wrong-user"
}

/**
 * Loads a pending, unexpired invitation for the acceptance page.
 *
 * @param input - Invitation id.
 * @returns `{ success: true, invitation }` or `{ success: false, error }`.
 */
export async function getInvitation(
  input: IdInput
): Promise<ActionResult<{ invitation: InvitationView }>> {
  try {
    const { id } = idSchema.parse(input)
    const invitation = await prisma.invitation.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
    })
    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt <= new Date()
    ) {
      throw new AppError(
        "Este convite expirou ou já foi usado. Peça um novo convite ao administrador da conta.",
        "invalid_invitation"
      )
    }
    const user = await getCurrentUser()
    const existing = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    })
    const mode: InvitationView["mode"] = user
      ? user.email === invitation.email
        ? "accept"
        : "wrong-user"
      : existing
        ? "login"
        : "sign-up"
    return {
      success: true,
      invitation: {
        id: invitation.id,
        organizationName: invitation.organization.name,
        email: invitation.email,
        roles: parseRoles(invitation.role),
        mode,
      },
    }
  } catch (error) {
    return toActionError(error, { action: "getInvitation" })
  }
}

/**
 * Links a user to the inviting account and marks the invitation as
 * accepted, in one transaction.
 *
 * @param invitationId - Invitation id.
 * @param userId - User accepting.
 * @param email - E-mail of the user, must match the invitation.
 */
async function joinOrganization(
  invitationId: string,
  userId: string,
  email: string
) {
  await prisma.$transaction(async (tx) => {
    const invitation = await tx.invitation.findUnique({
      where: { id: invitationId },
    })
    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt <= new Date() ||
      invitation.email !== email
    ) {
      throw new AppError(
        "Este convite expirou, já foi usado ou é de outro e-mail.",
        "invalid_invitation"
      )
    }
    const otherAccount = await tx.member.findFirst({
      where: { userId },
      select: { id: true },
    })
    if (otherAccount) {
      throw new AppError(
        "Sua conta já está vinculada a uma empresa.",
        "other_organization"
      )
    }
    await tx.member.create({
      data: {
        id: randomUUID(),
        organizationId: invitation.organizationId,
        userId,
        role: invitation.role ?? "requester",
        createdAt: new Date(),
      },
    })
    await tx.invitation.update({
      where: { id: invitationId },
      data: { status: "accepted" },
    })
    await writeAudit(tx, {
      userId,
      action: "organization.invite.accept",
      entity: "organization",
      entityId: invitation.organizationId,
      after: { invitationId },
    })
  })
}

/**
 * Accepts an invitation with the logged-in account (same e-mail).
 *
 * @param input - Invitation id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function acceptInvitation(input: IdInput): Promise<ActionResult> {
  try {
    const { id } = idSchema.parse(input)
    const user = await getCurrentUser()
    if (!user) throw new AppError("Entre na sua conta para aceitar.", "login")
    await joinOrganization(id, user.id, user.email)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "acceptInvitation" })
  }
}

/**
 * Creates the invited person's account and links it to the company in
 * one step (RF09). The e-mail comes from the invitation, not the form.
 *
 * @param input - Invitation id and the new account data.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function acceptInvitationWithSignUp(
  input: AcceptWithSignUpInput
): Promise<ActionResult> {
  try {
    const parsed = acceptWithSignUpSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError("Revise os dados do formulário.", "invalid")
    }
    const data = parsed.data
    const invitation = await prisma.invitation.findUnique({
      where: { id: data.invitationId },
      select: { email: true, status: true, expiresAt: true },
    })
    if (
      !invitation ||
      invitation.status !== "pending" ||
      invitation.expiresAt <= new Date()
    ) {
      throw new AppError("Este convite expirou ou já foi usado.", "invalid")
    }
    const cpfInUse = await prisma.user.findUnique({
      where: { document: data.cpf },
      select: { id: true },
    })
    if (cpfInUse) throw new AppError("Este CPF já tem cadastro.", "cpf_in_use")

    const result = await getAuth()
      .api.signUpEmail({
        headers: await headers(),
        body: {
          name: data.name,
          email: invitation.email,
          password: data.password,
          personType: "PJ",
          document: data.cpf,
          phone: data.phone,
        },
      })
      .catch((error: unknown) => {
        if (isAPIError(error)) {
          throw new AppError(
            "Não foi possível criar a conta. Se você já tem cadastro, entre e aceite o convite.",
            "sign_up_rejected"
          )
        }
        throw error
      })
    await joinOrganization(data.invitationId, result.user.id, invitation.email)
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "acceptInvitationWithSignUp" })
  }
}
