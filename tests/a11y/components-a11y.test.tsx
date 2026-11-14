// @vitest-environment jsdom
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CheckoutContext } from "@/features/payment/checkout/action/checkout-actions"
import { auditA11y, renderToDocument } from "./axe"

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children: ReactNode
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/",
}))
vi.mock("@/features/payment/checkout/action/checkout-actions", () => ({
  placeOrder: vi.fn(),
  quoteCheckoutShipping: vi.fn(),
}))
// Interactive islands of the product page call Server Actions; their
// own markup is covered by the component tests of each feature.
vi.mock("@/features/shared/components/add-to-cart-button", () => ({
  AddToCartButton: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}))
vi.mock("@/features/shared/components/favorite-button", () => ({
  FavoriteButton: ({ productName }: { productName: string }) => (
    <button type="button" aria-label={`Favoritar ${productName}`}>
      ♥
    </button>
  ),
}))
vi.mock("@/features/shared/components/compare-controls", () => ({
  CompareButton: ({ name }: { name: string }) => (
    <button type="button" aria-label={`Comparar ${name}`}>
      ⇄
    </button>
  ),
}))
vi.mock("@/features/shared/components/shipping-estimate", () => ({
  ShippingEstimate: () => null,
}))

const { SiteHeader } = await import("@/components/layout/site-header")
const { SiteFooter } = await import("@/components/layout/site-footer")
const { SkipLink, MAIN_CONTENT_ID } =
  await import("@/components/layout/skip-link")
const { ProductCard } = await import("@/components/commerce/product-card")
const { MaterialSwatches } =
  await import("@/components/commerce/material-swatches")
const { OrderSummary } = await import("@/components/commerce/order-summary")
const { SpecAccordion } = await import("@/components/commerce/spec-accordion")
const { HeroCarousel } = await import("@/components/commerce/hero-carousel")
const { FormField, fieldAria } = await import("@/components/ui/form-field")
const { Input } = await import("@/components/ui/input")
const { ProductPageView } =
  await import("@/features/catalog/product-page/product-page-view")
const { CheckoutView } =
  await import("@/features/payment/checkout/checkout-view")

const links = [
  { label: "Escrita fina", href: "/categoria/escrita-fina" },
  { label: "Iluminação", href: "/categoria/iluminacao" },
]

const product = {
  id: "p1",
  slug: "caneta-tinteiro-ebano",
  name: "Caneta tinteiro Ébano",
  description: "Caneta tinteiro em ébano maciço.",
  brand: "Atelier",
  category: { name: "Escrita fina", slug: "escrita-fina" },
  price: "1890.00",
  specs: [{ label: "Material", value: "Ébano" }],
  warrantyMonths: 12,
  includesExtendedWarranty: false,
  leadTimeDays: 5,
  requiresInstallation: false,
  personalizable: true,
  limitedEdition: false,
  lotNumber: null,
  images: [
    { key: "products/p1/a", alt: "Caneta tinteiro de ébano, vista lateral" },
    { key: "products/p1/b", alt: "Detalhe da pena de ouro" },
  ],
  datasheets: [{ name: "Ficha técnica", key: "docs/p1/ficha.pdf" }],
  manuals: [],
  certifications: [],
  skus: [
    { code: "CT-1", name: "Nogueira", price: "1890.00", available: 2 },
    { code: "CT-2", name: "Grafite", price: "1990.00", available: 0 },
  ],
}

const checkoutContext = {
  cart: {
    lines: [
      {
        id: "l1",
        productName: "Caneta tinteiro Ébano",
        skuName: "Nogueira",
        quantity: 1,
        purchasable: true,
        total: "1890.00",
      },
    ],
    count: 1,
    subtotal: "1890.00",
    servicesTotal: "0.00",
    total: "1890.00",
    extraBusinessDays: 0,
  },
  addresses: [
    { id: "a1", label: "Escritório", line: "Av. Paulista, 1000, São Paulo" },
    { id: "a2", label: "Casa", line: "Rua Augusta, 10, São Paulo" },
  ],
  corporate: false,
  approvalLimit: null,
  paymentMethods: [
    { method: "PIX", label: "Pix", note: "Aprovação imediata." },
    { method: "CARD", label: "Cartão de crédito", note: "Em até 12 vezes." },
  ],
  installation: { required: false, products: [] },
} as unknown as CheckoutContext

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("WCAG 2.1 AA automated checks with axe-core (RNF13)", () => {
  it("store header has labelled search, menus and icon links", async () => {
    const violations = await auditA11y(
      <SiteHeader categories={links} services={links} cartCount={2} />
    )
    expect(violations).toEqual([])
  })

  it("store footer passes", async () => {
    const violations = await auditA11y(
      <SiteFooter categories={links} services={links} institutional={links} />
    )
    expect(violations).toEqual([])
  })

  it("product card passes and its image has alternative text", async () => {
    const element = (
      <ul>
        <li>
          <ProductCard
            slug="caneta"
            name="Caneta tinteiro Ébano"
            brand="Atelier"
            price="1890.00"
            imageKey="products/p1/a"
            imageAlt="Caneta tinteiro de ébano"
            available={false}
          />
        </li>
      </ul>
    )
    expect(await auditA11y(element)).toEqual([])
    const image = document.querySelector("img")
    expect(image?.getAttribute("alt")).toBe("Caneta tinteiro de ébano")
  })

  it("material swatches are a labelled radio group", async () => {
    const violations = await auditA11y(
      <MaterialSwatches
        name="sku"
        legend="Material e acabamento"
        options={[
          { value: "a", label: "Nogueira" },
          { value: "b", label: "Carvalho" },
        ]}
        value="a"
        onChange={() => {}}
      />
    )
    expect(violations).toEqual([])
    const radios = document.querySelectorAll('input[type="radio"]')
    expect(radios).toHaveLength(2)
    expect(document.querySelector("fieldset legend")).not.toBeNull()
  })

  it("form fields link the label and the error to the control", async () => {
    const violations = await auditA11y(
      <FormField id="email" label="E-mail" error="Informe um e-mail válido.">
        <Input id="email" type="email" {...fieldAria("email", "x")} />
      </FormField>
    )
    expect(violations).toEqual([])
    const input = document.getElementById("email")
    expect(input?.getAttribute("aria-describedby")).toBe("email-error")
    expect(input?.getAttribute("aria-invalid")).toBe("true")
  })

  it("order summary and spec accordion pass", async () => {
    const violations = await auditA11y(
      <div>
        <OrderSummary subtotal="100.00" shipping="20.00" total="120.00" />
        <SpecAccordion
          sections={[
            {
              title: "Especificações técnicas",
              rows: [{ label: "Material", value: "Ébano" }],
              defaultOpen: true,
            },
          ]}
        />
      </div>
    )
    expect(violations).toEqual([])
  })

  it("hero carousel has a pause/play control and labelled slides", async () => {
    const violations = await auditA11y(
      <HeroCarousel
        slides={[
          {
            id: "s1",
            title: "Coleção Ébano",
            imageKey: "home/s1",
            imageAlt: "Mesa com canetas de ébano",
            ctaLabel: "Ver coleção",
            ctaHref: "/categoria/escrita-fina",
          },
          { id: "s2", title: "Mobiliário executivo" },
        ]}
      />
    )
    expect(violations).toEqual([])
    expect(
      document.querySelector('button[aria-label$=" carrossel"]')
    ).not.toBeNull()
  })

  it("product page passes and every product image has alt text", async () => {
    const violations = await auditA11y(<ProductPageView product={product} />)
    expect(violations).toEqual([])
    const main = document.querySelector(
      'section[aria-label="Imagens do produto"]'
    )
    const mainImage = main?.querySelector("img")
    expect(mainImage?.getAttribute("alt")).toBe(
      "Caneta tinteiro de ébano, vista lateral"
    )
    // Thumbnails are inside buttons named after the image they show
    for (const button of main?.querySelectorAll("button") ?? []) {
      expect(button.getAttribute("aria-label")).toMatch(/^Ver imagem \d+: .+/)
    }
  })

  it("checkout uses native, labelled radio groups (keyboard operable)", async () => {
    const violations = await auditA11y(
      <CheckoutView context={checkoutContext} />
    )
    expect(violations).toEqual([])
    const radios = [...document.querySelectorAll('input[type="radio"]')]
    expect(radios.length).toBe(4)
    for (const radio of radios) {
      expect(radio.closest("label")).not.toBeNull()
      expect(radio.closest("fieldset")?.querySelector("legend")).not.toBeNull()
      expect(radio.getAttribute("tabindex")).toBeNull()
    }
    const confirm = [...document.querySelectorAll("button")].find(
      (button) => button.textContent === "Confirmar pedido"
    )
    expect(confirm?.getAttribute("type")).toBe("button")
  })
})

describe("keyboard navigation of the store shell (RNF13)", () => {
  it("the skip link is the first focusable element and targets the main content", () => {
    renderToDocument(
      <>
        <SkipLink />
        <SiteHeader categories={links} services={links} />
        <main id={MAIN_CONTENT_ID} tabIndex={-1}>
          <h1>Início</h1>
        </main>
      </>
    )
    const focusable = document.querySelector<HTMLElement>(
      "a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])"
    )
    expect(focusable?.textContent).toBe("Pular para o conteúdo")
    expect(focusable?.getAttribute("href")).toBe(`#${MAIN_CONTENT_ID}`)
    const target = document.getElementById(MAIN_CONTENT_ID)
    expect(target?.tagName).toBe("MAIN")
    // tabindex=-1 lets the skip link move focus into the region
    target?.focus()
    expect(document.activeElement).toBe(target)
  })

  it("no element uses a positive tabindex that breaks the tab order", () => {
    renderToDocument(
      <>
        <SiteHeader categories={links} services={links} />
        <ProductPageView product={product} />
        <CheckoutView context={checkoutContext} />
      </>
    )
    const positive = [...document.querySelectorAll("[tabindex]")].filter(
      (element) => Number(element.getAttribute("tabindex")) > 0
    )
    expect(positive).toEqual([])
  })
})
