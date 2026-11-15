import { Suspense } from "react"
import { ResetPasswordView } from "@/features/access/password-reset/password-reset-view"

export const metadata = {
  title: "Redefinir senha — Atelier Bureau",
  description: "Defina uma nova senha para a sua conta na Atelier Bureau.",
}

/**
 * Reads the reset token from the e-mailed link.
 *
 * @param props - Search params promise.
 * @returns The reset form.
 */
async function ResetWithToken({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  return <ResetPasswordView token={typeof token === "string" ? token : ""} />
}

/**
 * New password route, opened from the e-mailed link (RF40).
 *
 * @param props - Page props with the search params.
 * @returns The page.
 */
export default function ResetPasswordPage(
  props: PageProps<"/redefinir-senha">
) {
  return (
    <Suspense>
      <ResetWithToken
        searchParams={props.searchParams as Promise<{ token?: string }>}
      />
    </Suspense>
  )
}
