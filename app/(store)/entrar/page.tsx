import { Suspense } from "react"
import { SignInView } from "@/features/access/sign-in/sign-in-view"
import { safeRedirectPath } from "@/features/shared/lib/validation/documents"

export const metadata = { title: "Entrar — Atelier Bureau" }

/**
 * Reads the post-login destination from the query string.
 *
 * @param props - Search params promise.
 * @returns The login form.
 */
async function SignInWithRedirect({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  const { redirect } = await searchParams
  return <SignInView redirectTo={safeRedirectPath(redirect)} />
}

/**
 * Login route (RF39, RF40).
 *
 * @param props - Page props with the search params.
 * @returns The login page.
 */
export default function SignInPage(props: PageProps<"/entrar">) {
  return (
    <Suspense>
      <SignInWithRedirect
        searchParams={props.searchParams as Promise<{ redirect?: string }>}
      />
    </Suspense>
  )
}
