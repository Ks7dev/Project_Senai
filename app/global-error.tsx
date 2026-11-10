"use client"

/**
 * Last-resort error boundary, used when the root layout itself fails.
 * Renders its own document with a generic message (RNF05).
 *
 * @param props - The error (with its digest) and a reset function.
 * @returns A minimal error document.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          background: "#fbf9f5",
          color: "#1e2221",
          padding: "3rem",
          textAlign: "center",
        }}
      >
        <h1>Algo saiu do lugar</h1>
        <p>Não foi possível carregar a loja. Tente novamente em instantes.</p>
        {error.digest && <p>Código do erro: {error.digest}</p>}
        <button type="button" onClick={reset}>
          Tentar novamente
        </button>
      </body>
    </html>
  )
}
