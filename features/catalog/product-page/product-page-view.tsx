"use client"

import { useState } from "react"
import Link from "next/link"
import {
  CalendarClockIcon,
  FileTextIcon,
  MessageCircleIcon,
  ShieldCheckIcon,
} from "lucide-react"
import { MaterialSwatches } from "@/components/commerce/material-swatches"
import { SpecAccordion } from "@/components/commerce/spec-accordion"
import { PageContainer } from "@/components/layout/page-container"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import type { ProductPageData } from "@/features/catalog/product-page/load-product"
import { CompareButton } from "@/features/shared/components/compare-controls"
import { FavoriteButton } from "@/features/shared/components/favorite-button"
import { ShippingEstimate } from "@/features/shared/components/shipping-estimate"
import { cn } from "@/lib/utils"

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

type ProductPageViewProps = {
  /** Product data. */
  product: ProductPageData
}

/**
 * Product page (#26, RF03): gallery, variation choice, price, stock or
 * made-to-order notice, warranty, certifications, lead time, datasheet
 * download and the buy, quote and seller contact actions.
 *
 * @param props - Product data.
 * @returns The page content.
 */
export function ProductPageView({ product }: ProductPageViewProps) {
  const [imageIndex, setImageIndex] = useState(0)
  const [skuCode, setSkuCode] = useState(product.skus[0]?.code)
  const sku = product.skus.find((item) => item.code === skuCode)
  const image = product.images[imageIndex]
  const inStock = (sku?.available ?? 0) > 0

  return (
    <PageContainer className="flex flex-col gap-xl py-xl">
      <nav aria-label="Trilha" className="text-body-sm text-ink-muted">
        <Link href="/" className="hover:text-ink">
          Início
        </Link>{" "}
        /{" "}
        <Link
          href={`/categoria/${product.category.slug}`}
          className="hover:text-ink"
        >
          {product.category.name}
        </Link>
      </nav>

      <div className="grid gap-xl lg:grid-cols-2">
        <section
          aria-label="Imagens do produto"
          className="flex flex-col gap-sm"
        >
          <div className="aspect-square overflow-hidden rounded-lg bg-subtle">
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/media/${image.key}-1024.webp`}
                srcSet={`/media/${image.key}-640.webp 640w, /media/${image.key}-1024.webp 1024w, /media/${image.key}-1600.webp 1600w`}
                sizes="(min-width: 1200px) 50vw, 100vw"
                alt={image.alt}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-caps text-ink-muted uppercase">
                Imagem em breve
              </div>
            )}
          </div>
          {product.images.length > 1 && (
            <ul className="flex gap-sm overflow-x-auto">
              {product.images.map((item, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setImageIndex(index)}
                    aria-label={`Ver imagem ${index + 1}: ${item.alt}`}
                    aria-pressed={index === imageIndex}
                    className={cn(
                      "size-20 overflow-hidden rounded border-2",
                      index === imageIndex
                        ? "border-primary"
                        : "border-transparent"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/media/${item.key}-320.webp`}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Compra" className="flex flex-col gap-md">
          {product.brand && (
            <p className="text-caps text-clay uppercase">{product.brand}</p>
          )}
          <div className="flex items-start justify-between gap-md">
            <h1 className="text-headline-xl-mobile lg:text-headline-xl">
              {product.name}
            </h1>
            <div className="flex items-center gap-sm">
              <FavoriteButton
                productId={product.id}
                productName={product.name}
              />
              <CompareButton slug={product.slug} name={product.name} />
            </div>
          </div>
          <div className="flex flex-wrap gap-sm">
            {product.limitedEdition && (
              <Badge variant="outline">
                Edição limitada
                {product.lotNumber ? ` · lote ${product.lotNumber}` : ""}
              </Badge>
            )}
            {product.includesExtendedWarranty && (
              <Badge variant="secondary">Garantia estendida incluída</Badge>
            )}
            {product.personalizable && (
              <Badge variant="outline">Aceita gravação</Badge>
            )}
          </div>
          <p className="text-headline-md text-ink">
            {brl.format(Number(sku?.price ?? product.price))}
          </p>

          {product.skus.length > 1 && (
            <MaterialSwatches
              name="sku"
              legend="Material e acabamento"
              options={product.skus.map((item) => ({
                value: item.code,
                label: item.name,
              }))}
              value={skuCode}
              onChange={setSkuCode}
            />
          )}

          <p
            role="status"
            className={cn(
              "rounded p-sm text-body-sm",
              inStock ? "bg-primary-tint text-ink" : "bg-clay-tint text-ink"
            )}
          >
            {inStock
              ? `Em estoque. Envio em até ${product.leadTimeDays} dias úteis após a confirmação.`
              : `Sob encomenda: produção em até ${product.leadTimeDays} dias úteis após a confirmação.`}
          </p>

          <div className="flex flex-wrap gap-sm">
            <Link
              href={`/carrinho?adicionar=${encodeURIComponent(sku?.code ?? "")}`}
              className={buttonVariants({ size: "lg" })}
            >
              {inStock ? "Comprar" : "Encomendar"}
            </Link>
            <Link
              href={`/cotacao/nova?produto=${encodeURIComponent(product.slug)}`}
              className={buttonVariants({ variant: "ghost", size: "lg" })}
            >
              Solicitar cotação
            </Link>
          </div>
          <Link
            href={`/atendimento?produto=${encodeURIComponent(product.slug)}`}
            className="inline-flex items-center gap-sm text-body-sm text-primary underline"
          >
            <MessageCircleIcon className="size-4" aria-hidden /> Falar com um
            vendedor
          </Link>

          {sku && (
            <ShippingEstimate
              key={sku.code}
              items={[{ skuCode: sku.code, quantity: 1 }]}
            />
          )}

          <ul className="flex flex-col gap-sm border-t border-line-subtle pt-md text-body-sm">
            <li className="flex gap-sm">
              <ShieldCheckIcon className="size-5 text-primary" aria-hidden />
              Garantia de {product.warrantyMonths}{" "}
              {product.warrantyMonths === 1 ? "mês" : "meses"}
              {product.includesExtendedWarranty &&
                ", com garantia estendida incluída no preço"}
              .
            </li>
            <li className="flex gap-sm">
              <CalendarClockIcon className="size-5 text-primary" aria-hidden />
              {product.requiresInstallation
                ? "Entrega com instalação agendada no checkout."
                : `Prazo de produção ou separação: ${product.leadTimeDays} dias úteis.`}
            </li>
          </ul>
        </section>
      </div>

      <div className="grid gap-xl lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="descricao" className="flex flex-col gap-md">
          <h2 id="descricao" className="text-headline-md">
            Sobre o produto
          </h2>
          <p className="text-body whitespace-pre-line text-ink">
            {product.description}
          </p>
          <SpecAccordion
            sections={[
              ...(product.specs.length > 0
                ? [
                    {
                      title: "Especificações técnicas",
                      rows: product.specs,
                      defaultOpen: true,
                    },
                  ]
                : []),
              {
                title: "Garantia e cuidados",
                rows: [
                  {
                    label: "Garantia",
                    value: `${product.warrantyMonths} ${product.warrantyMonths === 1 ? "mês" : "meses"}${product.includesExtendedWarranty ? " (estendida incluída)" : ""}`,
                  },
                  {
                    label: "Trocas e devoluções",
                    value: "Mediante avaliação do produto.",
                  },
                ],
              },
              {
                title: "Entrega",
                rows: [
                  {
                    label: "Prazo de produção ou separação",
                    value: `${product.leadTimeDays} dias úteis`,
                  },
                  {
                    label: "Instalação",
                    value: product.requiresInstallation
                      ? "Agendada no checkout"
                      : "Não necessária",
                  },
                ],
              },
            ]}
          />
        </section>

        {(product.datasheets.length > 0 ||
          product.certifications.length > 0) && (
          <aside
            aria-labelledby="documentos"
            className="flex flex-col gap-sm rounded-lg bg-subtle p-lg"
          >
            <h2 id="documentos" className="text-headline-sm">
              Documentos
            </h2>
            <ul className="flex flex-col gap-sm text-body-sm">
              {product.datasheets.map((document) => (
                <li key={document.key}>
                  <a
                    href={`/media/${document.key}`}
                    download
                    className="inline-flex items-center gap-sm text-primary underline"
                  >
                    <FileTextIcon className="size-4" aria-hidden />
                    {document.name} (PDF)
                  </a>
                </li>
              ))}
              {product.certifications.map((document) => (
                <li key={document.key}>
                  <a
                    href={`/media/${document.key}`}
                    className="inline-flex items-center gap-sm text-primary underline"
                  >
                    <ShieldCheckIcon className="size-4" aria-hidden />
                    Certificação: {document.name}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </PageContainer>
  )
}
