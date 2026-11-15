import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = {
  title: "Garantia — Atelier Bureau",
  description:
    "Prazos e condições da garantia legal e da garantia estendida dos produtos do Atelier Bureau, e como abrir um chamado de assistência técnica.",
}

/**
 * Warranty policy (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function WarrantyPage() {
  return <InstitutionalPageView slug="garantia" />
}
