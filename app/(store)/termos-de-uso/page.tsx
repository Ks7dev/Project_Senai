import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = { title: "Termos de uso — Atelier Bureau" }

/**
 * Terms of use (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function TermsPage() {
  return <InstitutionalPageView slug="termos-de-uso" />
}
