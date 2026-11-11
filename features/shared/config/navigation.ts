/** A navigation link shown in the header, mobile menu or footer. */
export type NavLink = {
  /** Visible label, in Portuguese. */
  label: string
  /** Internal route. */
  href: string
}

/**
 * Catalog categories shown in the main menu (RF01). Temporary static
 * list until the category tree is managed in the back office (#23).
 */
export const categoryLinks: NavLink[] = [
  { label: "Papelaria nobre", href: "/categoria/papelaria-nobre" },
  { label: "Escrita fina", href: "/categoria/escrita-fina" },
  { label: "Organização de mesa", href: "/categoria/organizacao-de-mesa" },
  { label: "Iluminação", href: "/categoria/iluminacao" },
  { label: "Mobiliário ergonômico", href: "/categoria/mobiliario-ergonomico" },
  { label: "Projetos B2B", href: "/categoria/projetos-b2b" },
]

/** Institutional pages linked in the footer (RF57). */
export const institutionalLinks: NavLink[] = [
  { label: "Termos de uso", href: "/termos-de-uso" },
  { label: "Política de privacidade", href: "/politica-de-privacidade" },
  { label: "Trocas e devoluções", href: "/trocas-e-devolucoes" },
  { label: "Garantia", href: "/garantia" },
]

/** Service links shown in the footer. */
export const serviceLinks: NavLink[] = [
  { label: "Solicitar cotação", href: "/cotacao/nova" },
  { label: "Agendar demonstração", href: "/demonstracao" },
  { label: "Minha conta", href: "/conta" },
  { label: "Acompanhar pedido", href: "/conta/pedidos" },
]
