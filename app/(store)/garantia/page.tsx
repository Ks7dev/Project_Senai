import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = { title: "Garantia — Atelier Bureau" }

/**
 * Warranty policy (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function WarrantyPage() {
  return <InstitutionalPageView slug="garantia" />
}
