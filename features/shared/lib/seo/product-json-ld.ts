/** Store name used in titles and structured data. */
export const STORE_NAME = "Atelier Bureau"

/** Fields of a product needed to build its structured data (RNF14). */
export type ProductJsonLdInput = {
  slug: string
  name: string
  description: string
  brand: string | null
  category: { name: string }
  /** Base price with two decimals, e.g. "1890.00". */
  price: string
  images: Array<{ key: string; alt: string }>
  skus: Array<{ code: string; name: string; price: string; available: number }>
}

/** schema.org availability values used by the store. */
const IN_STOCK = "https://schema.org/InStock"
/** Out of stock but sold to order (made to order, RF03). */
const BACK_ORDER = "https://schema.org/BackOrder"

type Offer = {
  "@type": "Offer"
  sku: string
  name: string
  price: string
  priceCurrency: "BRL"
  availability: string
  itemCondition: "https://schema.org/NewCondition"
  url: string
  seller: { "@type": "Organization"; name: string }
}

/** schema.org/Product document rendered as JSON-LD on the product page. */
export type ProductJsonLd = {
  "@context": "https://schema.org"
  "@type": "Product"
  name: string
  description: string
  url: string
  sku?: string
  image: string[]
  category: string
  brand?: { "@type": "Brand"; name: string }
  offers:
    | Offer
    | {
        "@type": "AggregateOffer"
        priceCurrency: "BRL"
        lowPrice: string
        highPrice: string
        offerCount: number
        availability: string
        offers: Offer[]
      }
}

/**
 * Plain text excerpt for meta descriptions and structured data: single
 * spaces and at most `max` characters, cut at a word boundary.
 *
 * @param text - Source text.
 * @param max - Maximum length (default 160, the usual snippet size).
 * @returns The excerpt.
 */
export function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max - 1)
  const lastSpace = cut.lastIndexOf(" ")
  return `${(lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/**
 * Builds the schema.org/Product structured data of a product page
 * (RNF14, #31): name, description, absolute image URLs, brand, category
 * and one offer per active SKU in BRL. A single SKU becomes an `Offer`;
 * several become an `AggregateOffer` with the price range.
 *
 * @param product - Product page data.
 * @param baseUrl - Public URL of the store, without a trailing slash.
 * @returns The JSON-LD object.
 */
export function buildProductJsonLd(
  product: ProductJsonLdInput,
  baseUrl: string
): ProductJsonLd {
  const url = `${baseUrl}/produto/${encodeURIComponent(product.slug)}`
  const seller = { "@type": "Organization" as const, name: STORE_NAME }
  const skus =
    product.skus.length > 0
      ? product.skus
      : [{ code: product.slug, name: product.name, price: product.price }]

  const offers: Offer[] = skus.map((sku) => ({
    "@type": "Offer",
    sku: sku.code,
    name: sku.name,
    price: sku.price,
    priceCurrency: "BRL",
    availability:
      "available" in sku && sku.available > 0 ? IN_STOCK : BACK_ORDER,
    itemCondition: "https://schema.org/NewCondition",
    url,
    seller,
  }))

  const prices = offers.map((offer) => Number(offer.price))
  const lowPrice = Math.min(...prices).toFixed(2)
  const highPrice = Math.max(...prices).toFixed(2)

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: excerpt(product.description, 5000),
    url,
    ...(offers.length === 1 ? { sku: offers[0].sku } : {}),
    image: product.images.map(
      (image) => `${baseUrl}/media/${image.key}-1024.webp`
    ),
    category: product.category.name,
    ...(product.brand
      ? { brand: { "@type": "Brand" as const, name: product.brand } }
      : {}),
    offers:
      offers.length === 1
        ? offers[0]
        : {
            "@type": "AggregateOffer",
            priceCurrency: "BRL",
            lowPrice,
            highPrice,
            offerCount: offers.length,
            availability: offers.some(
              (offer) => offer.availability === IN_STOCK
            )
              ? IN_STOCK
              : BACK_ORDER,
            offers,
          },
  }
}

/**
 * Serializes structured data for an inline `<script
 * type="application/ld+json">`, escaping `<` so a product text can never
 * close the script tag.
 *
 * @param data - JSON-LD object.
 * @returns The safe JSON string.
 */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
