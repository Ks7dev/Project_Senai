"use client"

import { Button } from "@/components/ui/button"

/**
 * Error boundary for every route. Shows a generic message and only
 * the error digest, never the stack trace or internal details (RNF05).
 *
 * @param props - The error (with its digest) and a reset function.
 * @returns The error page.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-md p-xl text-center">
      <p className="text-caps text-clay uppercase">Erro inesperado</p>
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">
        Algo saiu do lugar
      </h1>
      <p className="text-body text-ink-muted">
        Não foi possível carregar esta página. Tente novamente em instantes. Se
        o problema continuar, fale com o nosso atendimento.
      </p>
      {error.digest && (
        <p className="text-body-sm text-ink-muted">
          Código do erro: {error.digest}
        </p>
      )}
      <Button onClick={reset}>Tentar novamente</Button>
    </main>
  )
}
