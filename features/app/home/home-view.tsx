import { connection } from "next/server"
import { HeroCarousel } from "@/components/commerce/hero-carousel"
import { ProductCard } from "@/components/commerce/product-card"
import { PageContainer } from "@/components/layout/page-container"
import { getProductCardsBySlugs } from "@/features/shared/lib/catalog/catalog-query"
import { DEFAULT_HOME_CONTENT } from "@/features/shared/lib/content/home-content"
import { getHomeContent } from "@/features/shared/lib/content/home-content-cache"
import { logger } from "@/features/shared/lib/logger/logger"

/**
 * Editorial home (#30, RF47): carousel and product showcases managed
 * in the back office. Read at request time; falls back to the default
 * content if the database is unavailable.
 *
 * @returns The home content.
 */
export async function HomeView() {
  await connection()
  let content = DEFAULT_HOME_CONTENT
  try {
    content = await getHomeContent()
  } catch (error) {
    logger.error("home content unavailable", { error })
  }
  const showcases = await Promise.all(
    content.showcases.map(async (showcase) => ({
      ...showcase,
      products: await getProductCardsBySlugs(showcase.productSlugs).catch(
        () => []
      ),
    }))
  )

  return (
    <PageContainer className="flex flex-col gap-2xl py-lg">
      <h1 className="sr-only">
        Atelier Bureau — papelaria nobre e mobiliário executivo
      </h1>
      <HeroCarousel
        slides={content.slides.map((slide) => ({
          id: slide.id,
          title: slide.title,
          eyebrow: slide.eyebrow || undefined,
          subtitle: slide.subtitle || undefined,
          ctaLabel: slide.ctaLabel || undefined,
          ctaHref: slide.ctaHref || undefined,
          imageKey: slide.imageKey || undefined,
          imageAlt: slide.imageAlt || undefined,
        }))}
      />
      {showcases
        .filter((showcase) => showcase.products.length > 0)
        .map((showcase) => (
          <section
            key={showcase.id}
            aria-labelledby={`vitrine-${showcase.id}`}
            className="flex flex-col gap-lg"
          >
            <h2
              id={`vitrine-${showcase.id}`}
              className="text-headline-xl-mobile lg:text-headline-xl"
            >
              {showcase.title}
            </h2>
            <ul className="grid grid-cols-2 gap-gutter-mobile md:grid-cols-3 md:gap-gutter-tablet lg:grid-cols-4 lg:gap-gutter">
              {showcase.products.map((product) => (
                <li key={product.id}>
                  <ProductCard {...product} />
                </li>
              ))}
            </ul>
          </section>
        ))}
    </PageContainer>
  )
}
