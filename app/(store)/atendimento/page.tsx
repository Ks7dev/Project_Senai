import { Suspense } from "react"
import { PageContainer } from "@/components/layout/page-container"
import { getSellerContact } from "@/features/after-sales/seller-contact/action/seller-contact-actions"
import { SellerContactView } from "@/features/after-sales/seller-contact/seller-contact-view"

export const metadata = {
  title: "Atendimento — Atelier Bureau",
  description:
    "Fale com o vendedor dedicado da sua conta pelo WhatsApp e acesse a garantia e a assistência técnica.",
}

/** Query string of the page. */
type SearchParams = { produto?: string; origem?: string }

/**
 * Loads the seller of the customer.
 *
 * @param props - Search params promise.
 * @returns The contact.
 */
async function SellerContactSection({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { produto, origem } = await searchParams
  const result = await getSellerContact({
    produto: typeof produto === "string" ? produto : undefined,
    origem: origem === "carrinho" ? "carrinho" : undefined,
  })
  if (!result.success) {
    return (
      <p role="alert" className="text-body text-error">
        {result.error}
      </p>
    )
  }
  return <SellerContactView contact={result.contact} />
}

/**
 * Seller contact route (#69, RF18): the product page and the cart link
 * here.
 *
 * @param props - Page props.
 * @returns The page.
 */
export default function SellerContactPage(props: PageProps<"/atendimento">) {
  return (
    <PageContainer className="flex flex-col gap-lg py-xl">
      <header>
        <p className="text-caps text-clay uppercase">Atendimento</p>
        <h1 className="text-headline-xl-mobile lg:text-headline-xl">
          Fale com a Atelier Bureau
        </h1>
      </header>
      <Suspense fallback={<p className="text-body">Carregando atendimento…</p>}>
        <SellerContactSection
          searchParams={props.searchParams as Promise<SearchParams>}
        />
      </Suspense>
    </PageContainer>
  )
}
