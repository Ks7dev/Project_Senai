import "server-only"
import { createHash } from "node:crypto"
import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import {
  ORDER_STATUS,
  type OrderStatusKey,
} from "@/features/shared/lib/orders/order-status"

type Client = Prisma.TransactionClient | typeof prisma

/** Orders that no longer need the customer to be reachable. */
export const CLOSED_ORDER_STATUSES: readonly OrderStatusKey[] = [
  "DELIVERED",
  "INSTALLED",
  "CANCELED",
  "REFUNDED",
]

/** Name kept on an anonymized account. */
export const ANONYMIZED_NAME = "Titular anonimizado"

/** Text that replaces personal fields of addresses. */
const ANONYMIZED_TEXT = "Anonimizado"

/**
 * Formats a date for the export, in São Paulo time.
 *
 * @param date - Date or null.
 * @returns "dd/mm/aaaa hh:mm", or null.
 */
function formatDate(date: Date | null | undefined): string | null {
  if (!date) return null
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(date)
}

/**
 * Personal data of a customer in a readable format (RF56): Portuguese
 * labels, formatted dates and money as decimal strings. Passwords, 2FA
 * secrets, session tokens and card data are never included (cards
 * never reach the store, RN19).
 *
 * @param userId - Titular, from the session or chosen by the DPO.
 * @param client - Prisma client or transaction.
 * @returns The export.
 * @throws AppError("not_found") when the user does not exist.
 */
export async function buildPersonalDataExport(
  userId: string,
  client: Client = prisma
): Promise<Record<string, unknown>> {
  const user = await client.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      emailVerified: true,
      personType: true,
      document: true,
      phone: true,
      createdAt: true,
      deletedAt: true,
    },
  })
  if (!user) throw new AppError("Titular não encontrado.", "not_found")

  const [addresses, members, orders, quotes, favorites, sessions] =
    await Promise.all([
      client.address.findMany({
        where: { userId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      client.member.findMany({
        where: { userId },
        select: {
          role: true,
          createdAt: true,
          organization: { select: { name: true, cnpj: true } },
        },
      }),
      client.order.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          number: true,
          status: true,
          paymentMethod: true,
          subtotal: true,
          discount: true,
          servicesTotal: true,
          shippingTotal: true,
          total: true,
          shippingAddress: true,
          createdAt: true,
          items: {
            select: {
              productName: true,
              skuCode: true,
              quantity: true,
              unitPrice: true,
              total: true,
            },
          },
        },
      }),
      client.quote.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        select: {
          number: true,
          status: true,
          notes: true,
          total: true,
          createdAt: true,
          items: { select: { description: true, quantity: true } },
        },
      }),
      client.favorite.findMany({
        where: { userId },
        select: { createdAt: true, product: { select: { name: true } } },
      }),
      client.session.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          expiresAt: true,
          ipAddress: true,
          userAgent: true,
        },
      }),
    ])

  return {
    "Gerado em": formatDate(new Date()),
    Controlador: "Atelier Bureau (projeto acadêmico SENAI, dados fictícios)",
    Cadastro: {
      Nome: user.name,
      "E-mail": user.email,
      "E-mail confirmado": user.emailVerified ? "Sim" : "Não",
      Tipo: user.personType === "PJ" ? "Pessoa jurídica" : "Pessoa física",
      "CPF ou CNPJ": user.document,
      Telefone: user.phone,
      "Criado em": formatDate(user.createdAt),
      "Anonimizado em": formatDate(user.deletedAt),
    },
    Endereços: addresses.map((address) => ({
      Apelido: address.label,
      Destinatário: address.recipient,
      CEP: address.cep,
      Logradouro: address.street,
      Número: address.number,
      Complemento: address.complement,
      Bairro: address.district,
      Cidade: address.city,
      UF: address.state,
      Principal: address.isDefault ? "Sim" : "Não",
    })),
    "Contas corporativas": members.map((member) => ({
      Empresa: member.organization.name,
      CNPJ: member.organization.cnpj,
      Perfis: member.role,
      Desde: formatDate(member.createdAt),
    })),
    Pedidos: orders.map((order) => ({
      Número: order.number,
      Data: formatDate(order.createdAt),
      Situação: ORDER_STATUS[order.status].label,
      Pagamento: order.paymentMethod,
      Subtotal: order.subtotal.toFixed(2),
      Desconto: order.discount.toFixed(2),
      Serviços: order.servicesTotal.toFixed(2),
      Frete: order.shippingTotal.toFixed(2),
      Total: order.total.toFixed(2),
      "Endereço de entrega": order.shippingAddress,
      Itens: order.items.map((item) => ({
        Produto: item.productName,
        SKU: item.skuCode,
        Quantidade: item.quantity,
        "Preço unitário": item.unitPrice.toFixed(2),
        Total: item.total.toFixed(2),
      })),
    })),
    Cotações: quotes.map((quote) => ({
      Número: quote.number,
      Data: formatDate(quote.createdAt),
      Situação: quote.status,
      Observações: quote.notes,
      Total: quote.total.toFixed(2),
      Itens: quote.items.map((item) => ({
        Descrição: item.description,
        Quantidade: item.quantity,
      })),
    })),
    Favoritos: favorites.map((favorite) => ({
      Produto: favorite.product.name,
      "Adicionado em": formatDate(favorite.createdAt),
    })),
    "Acessos (sessões ativas)": sessions.map((session) => ({
      Início: formatDate(session.createdAt),
      Expira: formatDate(session.expiresAt),
      IP: session.ipAddress,
      Navegador: session.userAgent,
    })),
  }
}

/**
 * Document that replaces the CPF/CNPJ of an anonymized account: unique
 * (the column is unique) and not reversible to the original.
 *
 * @param userId - User id.
 * @returns 14 characters starting with "X".
 */
export function anonymizedDocument(userId: string): string {
  return `X${createHash("sha256").update(userId).digest("hex").slice(0, 13).toUpperCase()}`
}

/**
 * E-mail that replaces the login of an anonymized account (reserved
 * ".invalid" domain, so it never receives mail).
 *
 * @param userId - User id.
 * @returns The placeholder e-mail.
 */
export function anonymizedEmail(userId: string): string {
  return `anonimizado+${userId}@anonimizado.invalid`
}

/**
 * Refuses the anonymization while it would break something in course:
 * an order still being delivered, or a corporate account left without
 * an administrator.
 *
 * @param tx - Prisma transaction.
 * @param userId - Titular.
 * @throws AppError explaining what must happen first.
 */
export async function assertCanAnonymize(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  const open = await tx.order.count({
    where: { userId, status: { notIn: [...CLOSED_ORDER_STATUSES] } },
  })
  if (open > 0) {
    throw new AppError(
      "Há pedidos em andamento. A exclusão fica disponível depois da entrega ou do cancelamento.",
      "open_orders"
    )
  }
  const adminOf = await tx.member.findMany({
    where: { userId, role: { contains: "admin" } },
    select: { organizationId: true },
  })
  for (const { organizationId } of adminOf) {
    const [otherAdmins, otherMembers] = await Promise.all([
      tx.member.count({
        where: {
          organizationId,
          userId: { not: userId },
          role: { contains: "admin" },
        },
      }),
      tx.member.count({ where: { organizationId, userId: { not: userId } } }),
    ])
    if (otherMembers > 0 && otherAdmins === 0) {
      throw new AppError(
        "Você é o único administrador da conta corporativa. Transfira a administração antes de excluir seus dados.",
        "sole_admin"
      )
    }
  }
}

/**
 * Anonymizes a customer (RF56) without breaking orders and invoices:
 * the account keeps its id, so orders, invoices, payments and the audit
 * log stay linked, while name, e-mail, document and phone are replaced,
 * addresses are anonymized and soft deleted, and logins, sessions, 2FA,
 * carts, favorites, memberships and roles are removed. The address and
 * buyer data copied on each order stay, because the fiscal records must
 * be kept by law.
 *
 * @param tx - Prisma transaction.
 * @param userId - Titular.
 * @param now - Moment of the anonymization.
 * @returns How many rows were changed, for the audit log.
 */
export async function anonymizeUser(
  tx: Prisma.TransactionClient,
  userId: string,
  now: Date = new Date()
): Promise<Record<string, number>> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { email: true, deletedAt: true },
  })
  if (!user) throw new AppError("Titular não encontrado.", "not_found")
  if (user.deletedAt) {
    throw new AppError("Os dados deste titular já foram anonimizados.", "done")
  }
  await assertCanAnonymize(tx, userId)

  await tx.user.update({
    where: { id: userId },
    data: {
      name: ANONYMIZED_NAME,
      email: anonymizedEmail(userId),
      emailVerified: false,
      document: anonymizedDocument(userId),
      phone: null,
      image: null,
      twoFactorEnabled: false,
      deletedAt: now,
    },
  })
  const [sessions, accounts, twoFactors, addresses, favorites, carts] =
    await Promise.all([
      tx.session.deleteMany({ where: { userId } }),
      tx.account.deleteMany({ where: { userId } }),
      tx.twoFactor.deleteMany({ where: { userId } }),
      tx.address.updateMany({
        where: { userId },
        data: {
          label: ANONYMIZED_TEXT,
          recipient: ANONYMIZED_TEXT,
          cep: "00000000",
          street: ANONYMIZED_TEXT,
          number: "0",
          complement: null,
          district: ANONYMIZED_TEXT,
          isDefault: false,
          deletedAt: now,
        },
      }),
      tx.favorite.deleteMany({ where: { userId } }),
      tx.cart.deleteMany({ where: { userId } }),
    ])
  const [members, invitations, roles] = await Promise.all([
    tx.member.deleteMany({ where: { userId } }),
    tx.invitation.deleteMany({
      where: { email: user.email, status: "pending" },
    }),
    tx.userRole.deleteMany({ where: { userId } }),
  ])
  return {
    sessions: sessions.count,
    logins: accounts.count,
    twoFactors: twoFactors.count,
    addresses: addresses.count,
    favorites: favorites.count,
    carts: carts.count,
    memberships: members.count,
    invitations: invitations.count,
    roles: roles.count,
  }
}
