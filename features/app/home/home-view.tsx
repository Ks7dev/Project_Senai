/**
 * Temporary home view shown until the editorial home (#30) is built.
 *
 * @returns The home page content.
 */
export function HomeView() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-md p-xl text-center">
      <p className="text-caps text-clay uppercase">Papelaria nobre</p>
      <h1 className="text-display-mobile lg:text-display">Atelier Bureau</h1>
      <p className="max-w-md text-body-lg text-ink-muted">
        Papelaria nobre e mobiliário executivo. Loja em construção.
      </p>
    </main>
  )
}
