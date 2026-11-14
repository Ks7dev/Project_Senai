import { Suspense } from "react"
import { redirect } from "next/navigation"
import { PageContainer } from "@/components/layout/page-container"
import { getDemoScheduling } from "@/features/after-sales/demo-scheduling/action/demo-scheduling-actions"
import { DemoSchedulingView } from "@/features/after-sales/demo-scheduling/demo-scheduling-view"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"

export const metadata = {
  title: "Agendar demonstração — Atelier Bureau",
  description:
    "Agende uma demonstração de mobiliário executivo e itens de projeto com o seu vendedor.",
}

/** Query string of the page. */
type SearchParams = { produto?: string }

/**
 * Loads the agenda; visitors go to the login and come back.
 *
 * @param props - Search params promise.
 * @returns The scheduling.
 */
async function DemoSection({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { produto } = await searchParams
  const result = await getDemoScheduling({
    produto: typeof produto === "string" ? produto : undefined,
  })
  if (!result.success) {
    if (result.error === UNAUTHENTICATED_MESSAGE) {
      const back =
        typeof produto === "string"
          ? `/demonstracao?produto=${encodeURIComponent(produto)}`
          : "/demonstracao"
      redirect(`/entrar?redirect=${encodeURIComponent(back)}`)
    }
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <DemoSchedulingView scheduling={result.scheduling} />
}

/**
 * Demonstration scheduling route (#70, RF19); the footer, the product
 * page and the service page link here.
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function DemoPage(props: PageProps<"/demonstracao">) {
  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Atendimento</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Agendar demonstração
        </h1>
        <p className="text-body text-ink-muted">
          Para mobiliário, iluminação e projetos de escritório: veja os produtos
          com o seu vendedor no showroom, por videochamada ou no seu endereço.
        </p>
      </header>
      <Suspense fallback={<p className="text-body">Carregando agenda…</p>}>
        <DemoSection
          searchParams={props.searchParams as Promise<SearchParams>}
        />
      </Suspense>
    </PageContainer>
  )
}
