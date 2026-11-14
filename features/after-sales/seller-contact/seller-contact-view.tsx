import Link from "next/link"
import { CalendarClockIcon, MessageCircleIcon, WrenchIcon } from "lucide-react"
import { buttonVariants } from "@/components/ui/button"
import type { SellerContact } from "@/features/after-sales/seller-contact/action/seller-contact-actions"

/**
 * Seller contact page (RF18): the seller of the account and the
 * WhatsApp button, plus the after-sales shortcuts. The seller is set by
 * the store by region or segment (RN11); the page says so and offers no
 * way to change it.
 *
 * @param props - Seller contact data.
 * @returns The page content.
 */
export function SellerContactView({ contact }: { contact: SellerContact }) {
  const { seller } = contact
  return (
    <div className="flex flex-col gap-lg">
      <section
        aria-labelledby="vendedor"
        className="flex flex-col gap-md rounded-lg border border-line-subtle p-lg"
      >
        <h2 id="vendedor" className="text-headline-md">
          {contact.loggedIn ? "Seu vendedor dedicado" : "Fale com um vendedor"}
        </h2>
        {contact.product && (
          <p className="text-body text-ink-muted">
            Sobre o produto{" "}
            <Link
              href={`/produto/${contact.product.slug}`}
              className="text-primary underline"
            >
              {contact.product.name}
            </Link>
            .
          </p>
        )}
        {contact.fromCart && (
          <p className="text-body text-ink-muted">
            Sobre os itens do carrinho.
          </p>
        )}
        {seller ? (
          <>
            <p className="text-subhead text-ink">{seller.name}</p>
            {seller.whatsappUrl ? (
              <a
                href={seller.whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  size: "lg",
                  className: "self-start",
                })}
              >
                <MessageCircleIcon aria-hidden /> Conversar pelo WhatsApp
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            ) : (
              <p className="text-body text-ink-muted">
                O WhatsApp deste vendedor ainda não foi cadastrado. Solicite uma
                cotação e ele responde pelo site.
              </p>
            )}
            <p className="text-body-sm text-ink-muted">
              {contact.loggedIn
                ? "O vendedor da sua conta é definido pela Atelier Bureau conforme a região e o segmento do cadastro."
                : "Entre na sua conta para falar com o vendedor dedicado à sua região e ao seu segmento."}
            </p>
            {!contact.loggedIn && (
              <Link
                href="/entrar?redirect=%2Fatendimento"
                className="text-body-sm text-primary underline"
              >
                Entrar na minha conta
              </Link>
            )}
          </>
        ) : (
          <p className="text-body text-ink-muted">
            Nenhum vendedor disponível no momento. Solicite uma cotação e a
            equipe comercial responde pelo site.
          </p>
        )}
      </section>

      <section aria-labelledby="pos-venda" className="flex flex-col gap-sm">
        <h2 id="pos-venda" className="text-headline-sm">
          Outros atendimentos
        </h2>
        <ul className="flex flex-col gap-sm text-body">
          <li>
            <Link
              href="/conta/chamados/novo"
              className="inline-flex items-center gap-sm text-primary underline"
            >
              <WrenchIcon className="size-4" aria-hidden /> Garantia e
              assistência técnica
            </Link>
          </li>
          <li>
            <Link
              href={
                contact.product
                  ? `/demonstracao?produto=${encodeURIComponent(contact.product.slug)}`
                  : "/demonstracao"
              }
              className="inline-flex items-center gap-sm text-primary underline"
            >
              <CalendarClockIcon className="size-4" aria-hidden /> Agendar
              demonstração
            </Link>
          </li>
          <li>
            <Link
              href={
                contact.product
                  ? `/cotacao/nova?produto=${encodeURIComponent(contact.product.slug)}`
                  : "/cotacao/nova"
              }
              className="text-primary underline"
            >
              Solicitar cotação
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
