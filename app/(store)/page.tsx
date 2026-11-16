import { Suspense } from "react"
import { HomeView } from "@/features/app/home/home-view"

export const metadata = {
  title: "Atelier Bureau — Papelaria nobre e mobiliário executivo",
  description:
    "Papelaria nobre, escrita fina e mobiliário executivo para empresas e pessoas, com cotação corporativa, garantia e entrega para todo o Brasil.",
}

/**
 * Home route. Renders the editorial home managed in the back office.
 *
 * @returns The home page.
 */
export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-[32rem]" aria-busy="true" />}>
      <HomeView />
    </Suspense>
  )
}
