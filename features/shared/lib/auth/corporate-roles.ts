/** Corporate account roles (RF10). A member may hold several. */
export const CORPORATE_ROLES = {
  requester: "Solicitante",
  approver: "Aprovador",
  finance: "Financeiro",
  admin: "Administrador da conta",
} as const

/** Corporate role key. */
export type CorporateRole = keyof typeof CORPORATE_ROLES

/** Actions a corporate account member may perform. */
export type CorporatePermission =
  | "order:create"
  | "quote:create"
  | "order:approve"
  | "finance:read"
  | "member:manage"
  | "address:manage"

const ROLE_PERMISSIONS: Record<CorporateRole, CorporatePermission[]> = {
  requester: ["order:create", "quote:create"],
  approver: ["order:create", "quote:create", "order:approve"],
  finance: ["finance:read", "quote:create"],
  admin: ["order:create", "quote:create", "member:manage", "address:manage"],
}

/**
 * Parses the roles stored in `members.role` ("admin,approver").
 * Unknown values are ignored.
 *
 * @param value - Stored roles.
 * @returns Valid roles, without duplicates.
 */
export function parseRoles(value: string | null | undefined): CorporateRole[] {
  const roles = (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role): role is CorporateRole => role in CORPORATE_ROLES)
  return [...new Set(roles)]
}

/**
 * Serializes roles for `members.role`, in a stable order.
 *
 * @param roles - Roles.
 * @returns Comma separated roles.
 */
export function serializeRoles(roles: CorporateRole[]): string {
  const order = Object.keys(CORPORATE_ROLES) as CorporateRole[]
  return order.filter((role) => roles.includes(role)).join(",")
}

/**
 * Whether roles grant a corporate permission (RF10). Checked on the
 * server by every corporate action.
 *
 * @param roles - Member roles.
 * @param permission - Required permission.
 * @returns True when allowed.
 */
export function hasCorporatePermission(
  roles: CorporateRole[],
  permission: CorporatePermission
): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission))
}

/** A member and their roles, used to validate RN08. */
export type MemberRoles = { userId: string; roles: CorporateRole[] }

/**
 * Applies RN08 to the members of a corporate account after a change:
 * a single-user account always holds administrator and approver; a
 * multi-user account needs at least one approver and one administrator.
 *
 * @param members - Members after the change.
 * @returns The members to save (roles completed for a single user),
 * or an error message in Portuguese.
 */
export function applyApproverRule(
  members: MemberRoles[]
): { members: MemberRoles[] } | { error: string } {
  if (members.length === 0) return { members }
  if (members.length === 1) {
    const [only] = members
    return {
      members: [
        {
          userId: only.userId,
          roles: [
            ...new Set<CorporateRole>([...only.roles, "admin", "approver"]),
          ],
        },
      ],
    }
  }
  if (!members.some((member) => member.roles.includes("approver"))) {
    return {
      error:
        "Contas com mais de um usuário precisam de pelo menos um aprovador.",
    }
  }
  if (!members.some((member) => member.roles.includes("admin"))) {
    return {
      error: "A conta precisa de pelo menos um administrador.",
    }
  }
  return { members }
}
