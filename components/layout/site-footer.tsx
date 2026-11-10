import Link from "next/link"
import { PageContainer, PageGrid } from "@/components/layout/page-container"
import type { NavLink } from "@/features/shared/config/navigation"

type SiteFooterProps = {
  /** Category links. */
  categories: NavLink[]
  /** Service and account links. */
  services: NavLink[]
  /** Institutional pages: terms, privacy, returns and warranty (RF57). */
  institutional: NavLink[]
}

/**
 * Footer column with a title and a list of links.
 *
 * @param props - Column title and links.
 * @returns The column.
 */
function FooterColumn({ title, links }: { title: string; links: NavLink[] }) {
  return (
    <div className="col-span-2 flex flex-col gap-sm md:col-span-2 lg:col-span-3">
      <h2 className="font-sans text-caps text-clay uppercase">{title}</h2>
      <ul className="flex flex-col gap-xs">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="rounded text-body-sm text-ink-muted hover:text-ink"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Institutional footer with categories, services, institutional pages
 * and company data (#17). The CNPJ is fictitious (academic project).
 *
 * @param props - Footer link groups.
 * @returns The footer.
 */
export function SiteFooter({
  categories,
  services,
  institutional,
}: SiteFooterProps) {
  return (
    <footer className="mt-auto border-t border-line-subtle bg-subtle">
      <PageContainer className="py-xl">
        <PageGrid className="gap-y-lg">
          <div className="col-span-4 flex flex-col gap-sm md:col-span-2 lg:col-span-3">
            <p className="font-serif text-headline-sm text-ink">
              Atelier Bureau
            </p>
            <p className="text-body-sm text-ink-muted">
              Papelaria nobre e mobiliário executivo para empresas e pessoas.
            </p>
          </div>
          <FooterColumn title="Categorias" links={categories} />
          <FooterColumn title="Atendimento" links={services} />
          <FooterColumn title="Institucional" links={institutional} />
        </PageGrid>
        <div className="mt-xl flex flex-col gap-xs border-t border-line-subtle pt-md text-body-sm text-ink-muted md:flex-row md:justify-between">
          <p>© 2026 Atelier Bureau. Projeto acadêmico SENAI.</p>
          <p>CNPJ 00.000.000/0001-00 (fictício)</p>
        </div>
      </PageContainer>
    </footer>
  )
}
