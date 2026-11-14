import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = { title: "Trocas e devoluções — Atelier Bureau" }

/**
 * Exchanges and returns policy (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function ExchangesPage() {
  return <InstitutionalPageView slug="trocas-e-devolucoes" />
}
