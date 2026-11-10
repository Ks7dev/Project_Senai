/**
 * Temporary home view shown until the editorial home (#30) is built.
 *
 * @returns The home page content.
 */
export function HomeView() {
  return (
    <main className="gap-md p-xl flex flex-1 flex-col items-center justify-center text-center">
      <p className="text-caps text-secondary uppercase">Papelaria nobre</p>
      <h1 className="text-display-mobile lg:text-display">Atelier Bureau</h1>
      <p className="text-body-lg text-ink-muted max-w-md">
        Papelaria nobre e mobiliário executivo. Loja em construção.
      </p>
    </main>
  )
}
