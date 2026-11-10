import { notFound } from "next/navigation"
import { ComponentsView } from "@/features/app/components/components-view"

/**
 * Internal component gallery used to review the design system states
 * and keyboard navigation. Not available in production builds.
 *
 * @returns The gallery page.
 */
export default function ComponentsPage() {
  if (process.env.NODE_ENV === "production") notFound()
  return <ComponentsView />
}
