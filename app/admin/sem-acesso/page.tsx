import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

/**
 * Shown when a back office user opens a module their profile does not
 * allow (RF55).
 *
 * @returns The page.
 */
export default function NoAccessPage() {
  return (
    <div className="flex max-w-xl flex-col gap-md">
      <p className="text-caps text-clay uppercase">Acesso restrito</p>
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">
        Este módulo não está liberado para o seu perfil
      </h1>
      <p className="text-body text-ink-muted">
        Se você precisa deste acesso, peça a um administrador para ajustar as
        suas permissões.
      </p>
      <Link href="/admin" className={buttonVariants({ variant: "ghost" })}>
        Voltar ao painel
      </Link>
    </div>
  )
}
