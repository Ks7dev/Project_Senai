import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PageContainer } from "@/components/layout/page-container"
import { AccountNav } from "@/features/account/overview/account-views"
import { loadAccountContext } from "@/features/account/overview/load-account"

/**
 * Loads the account menu; visitors go to the login.
 *
 * @returns The menu.
 */
async function AccountNavSection() {
  const context = await loadAccountContext()
  if (!context) redirect("/entrar?redirect=%2Fconta")
  return <AccountNav context={context} />
}

/**
 * Customer area layout (#37): menu by profile and the section content.
 * Each page still checks the session and permissions on the server.
 *
 * @param props - Layout props.
 * @returns The layout.
 */
export default function AccountLayout({ children }: LayoutProps<"/conta">) {
  return (
    <PageContainer className="grid gap-xl py-xl lg:grid-cols-[14rem_1fr]">
      <aside className="border-b border-line-subtle pb-md lg:border-r lg:border-b-0 lg:pr-md">
        <Suspense fallback={<p className="text-body-sm">Carregando menu…</p>}>
          <AccountNavSection />
        </Suspense>
      </aside>
      <div className="flex min-w-0 flex-col gap-lg">{children}</div>
    </PageContainer>
  )
}
