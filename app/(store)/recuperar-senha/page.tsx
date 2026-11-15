import { RequestResetView } from "@/features/access/password-reset/password-reset-view"

export const metadata = {
  title: "Recuperar senha — Atelier Bureau",
  description:
    "Receba por e-mail um link seguro para redefinir a senha da sua conta na Atelier Bureau.",
}

/**
 * Password reset request route (RF40).
 *
 * @returns The page.
 */
export default function RequestResetPage() {
  return <RequestResetView />
}
