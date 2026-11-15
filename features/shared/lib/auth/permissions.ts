/**
 * Internal permission keys, as "resource[:sub]:action" (RF55). They
 * match the rows seeded in the `permissions` table.
 */
export type Permission =
  | "product:read"
  | "product:create"
  | "product:update"
  | "product:delete"
  | "category:manage"
  | "stock:read"
  | "stock:update"
  | "order:read"
  | "order:status:update"
  | "order:cancel"
  | "shipment:manage"
  | "quote:read"
  | "quote:answer"
  | "customer:read"
  | "customer:update"
  | "credit:approve"
  | "payment:refund"
  | "invoice:manage"
  | "promotion:manage"
  | "content:manage"
  | "support:manage"
  | "user:manage"
  | "setting:manage"
  | "audit:read"
  | "privacy:manage"

/** A back office module and the permission needed to open it. */
export type AdminModule = {
  /** Route of the module. */
  href: string
  /** Menu label, in Portuguese. */
  label: string
  /** Permission required to see and open the module. */
  permission: Permission
}

/**
 * Back office modules. Each profile only sees and opens the modules
 * its permissions allow (RF55); the check that counts is on the server.
 */
export const adminModules: AdminModule[] = [
  { href: "/admin/produtos", label: "Produtos", permission: "product:read" },
  {
    href: "/admin/categorias",
    label: "Categorias",
    permission: "category:manage",
  },
  { href: "/admin/estoque", label: "Estoque", permission: "stock:read" },
  { href: "/admin/pedidos", label: "Pedidos", permission: "order:read" },
  {
    href: "/admin/separacao",
    label: "Separação e expedição",
    permission: "shipment:manage",
  },
  { href: "/admin/cotacoes", label: "Cotações", permission: "quote:read" },
  {
    href: "/admin/cotacoes-frete",
    label: "Cotações de frete",
    permission: "quote:read",
  },
  {
    href: "/admin/frete",
    label: "Frete e cobertura",
    permission: "setting:manage",
  },
  {
    href: "/admin/parcelamento",
    label: "Parcelamento",
    permission: "setting:manage",
  },
  { href: "/admin/clientes", label: "Clientes", permission: "customer:read" },
  {
    href: "/admin/financeiro",
    label: "Financeiro",
    permission: "payment:refund",
  },
  { href: "/admin/nfe", label: "NF-e", permission: "invoice:manage" },
  {
    href: "/admin/promocoes",
    label: "Promoções",
    permission: "promotion:manage",
  },
  { href: "/admin/conteudo", label: "Conteúdo", permission: "content:manage" },
  {
    href: "/admin/atendimento",
    label: "Atendimento",
    permission: "support:manage",
  },
  { href: "/admin/usuarios", label: "Usuários", permission: "user:manage" },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    permission: "setting:manage",
  },
  { href: "/admin/auditoria", label: "Auditoria", permission: "audit:read" },
  { href: "/admin/lgpd", label: "LGPD", permission: "privacy:manage" },
]

/**
 * Modules of issues not delivered yet. They stay out of the menu until
 * their route exists, so no menu link leads to a missing page.
 */
export const PENDING_ADMIN_ROUTES: ReadonlySet<string> = new Set([
  "/admin/separacao",
  "/admin/cotacoes",
  "/admin/clientes",
  "/admin/financeiro",
  "/admin/nfe",
  "/admin/promocoes",
  "/admin/atendimento",
  "/admin/configuracoes",
  "/admin/auditoria",
  "/admin/lgpd",
])

/**
 * Whether a set of granted permissions includes the required one.
 *
 * @param granted - Permissions of the user, from their roles.
 * @param required - Permission needed for the action.
 * @returns True when allowed.
 */
export function hasPermission(
  granted: ReadonlySet<string>,
  required: Permission
): boolean {
  return granted.has(required)
}

/**
 * Back office modules the user may see in the menu.
 *
 * @param granted - Permissions of the user.
 * @returns The allowed modules, in menu order.
 */
export function visibleAdminModules(
  granted: ReadonlySet<string>
): AdminModule[] {
  return adminModules.filter(
    (item) =>
      !PENDING_ADMIN_ROUTES.has(item.href) && granted.has(item.permission)
  )
}

/**
 * Builds the permission key stored in the database.
 *
 * @param resource - Resource, e.g. "order:status".
 * @param action - Action, e.g. "update".
 * @returns The key, e.g. "order:status:update".
 */
export function permissionKey(resource: string, action: string): string {
  return `${resource}:${action}`
}
