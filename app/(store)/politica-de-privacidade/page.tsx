import { InstitutionalPageView } from "@/features/app/institutional/institutional-page-view"

export const metadata = {
  title: "Política de privacidade — Atelier Bureau",
  description:
    "Como o Atelier Bureau coleta, usa e protege os seus dados pessoais, e como exercer os seus direitos de titular pela LGPD.",
}

/**
 * Privacy policy (#74, RF57), edited in the back office.
 *
 * @returns The page.
 */
export default function PrivacyPage() {
  return <InstitutionalPageView slug="politica-de-privacidade" />
}
