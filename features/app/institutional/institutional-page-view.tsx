import { Suspense } from "react"
import { unstable_rethrow } from "next/navigation"
import { connection } from "next/server"
import { PageContainer } from "@/components/layout/page-container"
import { RichText } from "@/features/shared/components/rich-text"
import {
  INSTITUTIONAL_TITLES,
  type InstitutionalPageContent,
  type InstitutionalSlug,
} from "@/features/shared/lib/content/institutional-pages"
import { getInstitutionalPage } from "@/features/shared/lib/content/institutional-pages-cache"
import { logger } from "@/features/shared/lib/logger/logger"

const updatedFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "long",
  timeZone: "America/Sao_Paulo",
})

/**
 * Loads the page saved in the back office; falls back to a notice when
 * the database is unavailable.
 *
 * @param props - Page route.
 * @returns The page content.
 */
async function InstitutionalContent({ slug }: { slug: InstitutionalSlug }) {
  // Request time only: the text is never read during the build
  await connection()
  let page: InstitutionalPageContent | null = null
  try {
    page = await getInstitutionalPage(slug)
  } catch (error) {
    unstable_rethrow(error)
    logger.error("institutional page unavailable", { slug, error })
  }
  return (
    <>
      <h1 className="text-headline-xl-mobile lg:text-headline-xl">
        {page?.title ?? INSTITUTIONAL_TITLES[slug]}
      </h1>
      {page?.updatedAt && (
        <p className="text-body-sm text-ink-muted">
          Atualizado em {updatedFormat.format(new Date(page.updatedAt))}.
        </p>
      )}
      {page?.body ? (
        <RichText source={page.body} />
      ) : (
        <p className="text-body text-ink-muted">
          O texto desta página está em atualização. Em caso de dúvida, fale com
          o nosso atendimento.
        </p>
      )}
    </>
  )
}

/**
 * Institutional page of the store (#74, RF57): terms of use, privacy
 * policy, exchanges and returns or warranty, with the text edited in
 * the back office without a deploy.
 *
 * @param props - Page route.
 * @returns The page.
 */
export function InstitutionalPageView({ slug }: { slug: InstitutionalSlug }) {
  return (
    <PageContainer className="flex max-w-3xl flex-col gap-lg py-xl">
      <p className="text-caps text-clay uppercase">Institucional</p>
      <Suspense
        fallback={
          <h1 className="text-headline-xl-mobile lg:text-headline-xl">
            {INSTITUTIONAL_TITLES[slug]}
          </h1>
        }
      >
        <InstitutionalContent slug={slug} />
      </Suspense>
    </PageContainer>
  )
}
