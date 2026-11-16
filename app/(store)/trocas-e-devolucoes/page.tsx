import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = {
  title: "Trocas e devoluções — Atelier Bureau",
  description:
    "Prazos e condições para troca, devolução e direito de arrependimento nas compras do Atelier Bureau.",
}

/**
 * Exchanges and returns policy (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function ExchangesPage() {
  return <InstitutionalPageView slug="trocas-e-devolucoes" />
}
