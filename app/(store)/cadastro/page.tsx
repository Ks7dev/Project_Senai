import { SignUpView } from "@/features/access/sign-up/sign-up-view"

export const metadata = {
  title: "Criar conta — Atelier Bureau",
  description:
    "Crie sua conta na Atelier Bureau como pessoa física ou empresa e acompanhe pedidos, cotações e favoritos.",
}

/**
 * Sign-up route (RF39).
 *
 * @returns The sign-up page.
 */
export default function SignUpPage() {
  return <SignUpView />
}
