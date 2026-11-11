import "server-only"
import type { Prisma } from "@/generated/prisma/client"
import {
  CORPORATE_ROLES,
  hasCorporatePermission,
  type CorporateRole,
} from "@/features/shared/lib/auth/corporate-roles"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { getCorporateContext } from "@/features/shared/lib/db/corporate"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  canChangeAddress,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"

/** A link of the account menu. */
export type AccountLink = { href: string; label: string }

/** Who is logged in and what the account menu shows (#37). */
export type AccountContext = {
  userId: string
  name: string
  email: string
  organizationName: string | null
  roles: CorporateRole[]
  roleLabels: string[]
  /** Whether the user sees every order of the company. */
  seesCompanyOrders: boolean
  links: AccountLink[]
}

/**
 * Builds the account context: corporate roles decide which sections
 * appear and whose orders are listed (#37, RF10). The user comes from
 * the session.
 *
 * @returns The context, or null for visitors.
 */
export async function loadAccountContext(): Promise<AccountContext | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const corporate = await getCorporateContext()
  const roles = corporate?.roles ?? []
  const organization = corporate
    ? await prisma.organization.findUnique({
        where: { id: corporate.organizationId },
        select: { name: true },
      })
    : null

  const links: AccountLink[] = [
    { href: "/conta", label: "Painel" },
    { href: "/conta/pedidos", label: "Pedidos" },
    { href: "/conta/cotacoes", label: "Cotações" },
    { href: "/conta/enderecos", label: "Endereços" },
    { href: "/conta/favoritos", label: "Favoritos" },
    { href: "/conta/listas", label: "Listas de projeto" },
    { href: "/conta/seguranca", label: "Dados e segurança" },
  ]
  if (corporate && hasCorporatePermission(roles, "member:manage")) {
    links.splice(4, 0, { href: "/conta/usuarios", label: "Usuários" })
  }
  if (corporate && hasCorporatePermission(roles, "order:approve")) {
    links.splice(2, 0, { href: "/conta/aprovacoes", label: "Aprovações" })
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    organizationName: organization?.name ?? null,
    roles,
    roleLabels: roles.map((role) => CORPORATE_ROLES[role]),
    seesCompanyOrders:
      Boolean(corporate) &&
      roles.some(
        (role) => role === "approver" || role === "finance" || role === "admin"
      ),
    links,
  }
}

/**
 * Orders the user may see: the whole company for approvers, finance and
 * administrators; only their own for requesters and PF customers.
 *
 * @param context - Account context.
 * @returns The Prisma where clause.
 */
export async function orderScope(
  context: AccountContext
): Promise<Prisma.OrderWhereInput> {
  if (context.seesCompanyOrders) {
    const corporate = await getCorporateContext()
    if (corporate) return { organizationId: corporate.organizationId }
  }
  return { userId: context.userId }
}

/** Order row of the customer area (RF15). */
export type AccountOrder = {
  id: string
  number: string
  status: OrderStatusKey
  total: string
  createdAt: string
  buyer: string
  /** Whether the user may change the delivery address (RN15, #45). */
  addressChangeable: boolean
}

/**
 * Lists the orders visible to the user, newest first.
 *
 * @param context - Account context.
 * @param options - Status filter and limit.
 * @returns Orders.
 */
export async function listAccountOrders(
  context: AccountContext,
  options: { status?: OrderStatusKey; take?: number } = {}
): Promise<AccountOrder[]> {
  const rows = await prisma.order.findMany({
    where: {
      ...(await orderScope(context)),
      ...(options.status ? { status: options.status } : {}),
    },
    select: {
      id: true,
      number: true,
      status: true,
      total: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 50,
  })
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    total: row.total.toFixed(2),
    createdAt: row.createdAt.toISOString(),
    buyer: row.user.name,
    addressChangeable:
      row.userId === context.userId && canChangeAddress(row.status),
  }))
}

/**
 * Counts open quotes visible to the user (requested, in review or
 * answered).
 *
 * @param context - Account context.
 * @returns Number of open quotes.
 */
export async function countOpenQuotes(
  context: AccountContext
): Promise<number> {
  const scope = await orderScope(context)
  return prisma.quote.count({
    where: {
      ...("organizationId" in scope
        ? { organizationId: scope.organizationId as string }
        : { userId: context.userId }),
      status: { in: ["REQUESTED", "IN_REVIEW", "ANSWERED"] },
    },
  })
}
