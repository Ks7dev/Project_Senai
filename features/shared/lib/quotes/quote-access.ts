import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import { hasCorporatePermission } from "@/features/shared/lib/auth/corporate-roles"
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/shared/lib/auth/session"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import {
  FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from "@/features/shared/lib/db/permissions"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { readStoredFile } from "@/features/shared/lib/storage/storage"

/** Message when a quote does not exist or belongs to someone else. */
export const QUOTE_NOT_FOUND_MESSAGE = "Cotação não encontrada."

/** Corporate roles that follow every quote of the company (RF10). */
const COMPANY_QUOTE_ROLES: readonly string[] = ["approver", "finance", "admin"]

/** The customer behind a quote action, from the session. */
export type QuoteCustomer = {
  /** Session user. */
  user: SessionUser
  /** Corporate account of the user, if any. */
  organizationId: string | null
  /** Whether the user may request quotes (RF10: quote:create). */
  canRequest: boolean
  /** Whether the user follows every quote of the company. */
  seesCompanyQuotes: boolean
}

/**
 * Loads the logged-in customer and what they may do with quotes. The
 * user id comes from the session, never from the request.
 *
 * @returns The customer.
 * @throws AppError("unauthenticated") for visitors.
 */
export async function loadQuoteCustomer(): Promise<QuoteCustomer> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const corporate = await getCorporateContext()
  if (!corporate) {
    return {
      user,
      organizationId: null,
      canRequest: true,
      seesCompanyQuotes: false,
    }
  }
  return {
    user,
    organizationId: corporate.organizationId,
    canRequest: hasCorporatePermission(corporate.roles, "quote:create"),
    seesCompanyQuotes: corporate.roles.some((role) =>
      COMPANY_QUOTE_ROLES.includes(role)
    ),
  }
}

/**
 * Loads the customer and refuses members whose corporate role does not
 * request quotes (RF10).
 *
 * @returns The customer.
 * @throws AppError("unauthenticated") or AppError("forbidden").
 */
export async function requireQuoteRequester(): Promise<QuoteCustomer> {
  const customer = await loadQuoteCustomer()
  if (!customer.canRequest) throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
  return customer
}

/**
 * Quotes the customer may see: the whole company for approvers, finance
 * and account administrators; only their own otherwise.
 *
 * @param customer - Customer from the session.
 * @returns The Prisma where clause.
 */
export function customerQuoteScope(
  customer: QuoteCustomer
): Prisma.QuoteWhereInput {
  if (customer.seesCompanyQuotes && customer.organizationId) {
    return { organizationId: customer.organizationId }
  }
  return { userId: customer.user.id }
}

/** A stored attachment, ready to be sent to the browser. */
export type AttachmentDownload = {
  /** Original file name. */
  name: string
  /** Media type. */
  mimeType: string
  /** File contents, base64. */
  data: string
}

/**
 * Reads an attachment from the private storage. Attachments are never
 * served by the public /media route; only actions that checked the
 * scope or the permission call this.
 *
 * @param attachment - Name, type and storage key.
 * @returns The download.
 * @throws AppError("attachment_missing") when the file is gone.
 */
export async function readQuoteAttachment(attachment: {
  name: string
  mimeType: string
  storageKey: string
}): Promise<AttachmentDownload> {
  const data = await readStoredFile(attachment.storageKey)
  if (!data) {
    throw new AppError(
      "O arquivo não está mais disponível.",
      "attachment_missing"
    )
  }
  return {
    name: attachment.name,
    mimeType: attachment.mimeType,
    data: data.toString("base64"),
  }
}
