import Link from "next/link"
import type { Permission } from "@/features/shared/lib/auth/permissions"

/** A section of the finance module. */
export type FinanceSection = {
  /** Route of the section. */
  href: string
  /** Title, in Portuguese. */
  title: string
  /** What the section does, in Portuguese. */
  description: string
  /** Permission needed to open it. */
  permission: Permission
}

/** Sections of the finance back office, in menu order. */
export const FINANCE_SECTIONS: readonly FinanceSection[] = [
  {
    href: "/admin/financeiro/credito",
    title: "Crédito corporativo",
    description:
      "Aprovar ou recusar contas para a compra faturada, definir o limite de crédito e consultar o histórico de alterações.",
    permission: "credit:approve",
  },
  {
    href: "/admin/financeiro/faturado",
    title: "Faturado 28/56 dias",
    description:
      "Boletos próprios das compras faturadas, vencimentos, baixa manual e pedidos faturados aguardando confirmação.",
    permission: "payment:refund",
  },
]

/**
 * Landing page of the finance module: lists the sections the user's
 * permissions allow. Presentation only; each section checks its own
 * permission on the server.
 *
 * @param props - Permissions of the user.
 * @returns The list of sections.
 */
export function FinanceHomeView({ granted }: { granted: ReadonlySet<string> }) {
  const sections = FINANCE_SECTIONS.filter((section) =>
    granted.has(section.permission)
  )
  if (sections.length === 0) {
    return (
      <p className="text-body text-ink-muted">
        Seu perfil não tem acesso a nenhuma seção do financeiro.
      </p>
    )
  }
  return (
    <ul className="grid gap-md md:grid-cols-2">
      {sections.map((section) => (
        <li key={section.href}>
          <Link
            href={section.href}
            className="flex h-full flex-col gap-xs rounded-lg border border-line-subtle bg-elevated p-md hover:shadow-1"
          >
            <span className="text-subhead text-ink">{section.title}</span>
            <span className="text-body-sm text-ink-muted">
              {section.description}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
