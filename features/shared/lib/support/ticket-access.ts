import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/shared/lib/auth/session"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { AppError } from "@/features/shared/lib/errors/action-result"

/** Message when a ticket does not exist or belongs to someone else. */
export const TICKET_NOT_FOUND_MESSAGE = "Chamado não encontrado."

/** Corporate roles that follow every ticket and order of the company. */
const COMPANY_ROLES: readonly string[] = ["approver", "finance", "admin"]

/** The customer behind an after-sales action, from the session. */
export type SupportCustomer = {
  /** Session user. */
  user: SessionUser
  /** Corporate account of the user, if any. */
  organizationId: string | null
  /** Whether the user follows the tickets of the whole company. */
  seesCompany: boolean
}

/**
 * Loads the logged-in customer of the after-sales area. The user id
 * comes from the session, never from the request.
 *
 * @returns The customer.
 * @throws AppError("unauthenticated") for visitors.
 */
export async function loadSupportCustomer(): Promise<SupportCustomer> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const corporate = await getCorporateContext()
  return {
    user,
    organizationId: corporate?.organizationId ?? null,
    seesCompany:
      corporate !== null &&
      corporate.roles.some((role) => COMPANY_ROLES.includes(role)),
  }
}

/**
 * Tickets the customer may follow: the whole company for approvers,
 * finance and account administrators; only their own otherwise.
 *
 * @param customer - Customer from the session.
 * @returns The Prisma where clause.
 */
export function supportTicketScope(
  customer: SupportCustomer
): Prisma.SupportTicketWhereInput {
  if (customer.seesCompany && customer.organizationId) {
    return {
      OR: [
        { userId: customer.user.id },
        { organizationId: customer.organizationId },
      ],
    }
  }
  return { userId: customer.user.id }
}

/**
 * Orders the customer may open a ticket for: the same orders they track
 * in the customer area (RF10, RF15).
 *
 * @param customer - Customer from the session.
 * @returns The Prisma where clause.
 */
export function supportOrderScope(
  customer: SupportCustomer
): Prisma.OrderWhereInput {
  if (customer.seesCompany && customer.organizationId) {
    return {
      OR: [
        { userId: customer.user.id },
        { organizationId: customer.organizationId },
      ],
    }
  }
  return { userId: customer.user.id }
}
