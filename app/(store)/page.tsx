import { Suspense } from "react"
import { HomeView } from "@/features/app/home/home-view"

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
