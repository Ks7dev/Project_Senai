import Link from "next/link"
import { buttonVariants } from "@/components/ui/button"

export const metadata = {
  title: "Página não encontrada — Atelier Bureau",
  description: "O endereço procurado não existe mais na Atelier Bureau.",
}

/**
 * 404 page shown for unknown routes.
 *
 * @returns The not found page.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-md p-xl text-center">
      <p className="text-caps text-clay uppercase">Erro 404</p>
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">
        Página não encontrada
      </h1>
      <p className="text-body text-ink-muted">
        O endereço pode ter mudado ou o item não está mais no acervo.
      </p>
      <Link href="/" className={buttonVariants()}>
        Voltar para a loja
      </Link>
    </main>
  )
}
