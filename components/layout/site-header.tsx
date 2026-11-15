import type { ReactNode } from "react"
import Link from "next/link"
import { SearchIcon, ShoppingBagIcon, UserIcon } from "lucide-react"
import { MobileMenu } from "@/components/layout/mobile-menu"
import { PageContainer } from "@/components/layout/page-container"
import { Input } from "@/components/ui/input"
import type { NavLink } from "@/features/shared/config/navigation"

type SiteHeaderProps = {
  /** Category links of the main menu. */
  categories: NavLink[]
  /** Account and service links for the mobile menu. */
  services: NavLink[]
  /** Number of items in the cart, shown on the cart link. */
  cartCount?: number
  /** Cart control (e.g. the cart drawer); replaces the cart link. */
  cart?: ReactNode
}

/**
 * Store header with logo, product search, category menu, account and
 * cart (#17). On mobile and tablet the categories move to a sheet.
 * The cart slot receives the cart drawer (#46); without it the header
 * links to the cart page.
 *
 * @param props - Navigation links and cart count.
 * @returns The header.
 */
export function SiteHeader({
  categories,
  services,
  cartCount = 0,
  cart,
}: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-line-subtle bg-canvas/95 backdrop-blur">
      <PageContainer className="flex h-16 items-center gap-md lg:h-20">
        <MobileMenu categories={categories} services={services} />
        <Link
          href="/"
          className="shrink-0 rounded font-serif text-headline-sm text-ink lg:text-headline-md"
        >
          Atelier Bureau
        </Link>
        <form
          action="/busca"
          role="search"
          className="ml-auto hidden max-w-md flex-1 md:block"
        >
          <label htmlFor="busca" className="sr-only">
            Buscar produtos
          </label>
          <div className="relative">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-md size-4 -translate-y-1/2 text-ink-muted"
            />
            <Input
              id="busca"
              name="q"
              type="search"
              placeholder="Buscar produtos, materiais ou coleções"
              className="h-10 rounded-full pl-10"
            />
          </div>
        </form>
        <nav aria-label="Conta e carrinho" className="ml-auto md:ml-0">
          <ul className="flex items-center gap-xs">
            <li className="md:hidden">
              <Link
                href="/busca"
                aria-label="Buscar produtos"
                className="flex size-11 items-center justify-center rounded text-ink hover:bg-subtle"
              >
                <SearchIcon className="size-5" />
              </Link>
            </li>
            <li>
              <Link
                href="/conta"
                aria-label="Minha conta"
                className="flex size-11 items-center justify-center rounded text-ink hover:bg-subtle"
              >
                <UserIcon className="size-5" />
              </Link>
            </li>
            <li>
              {cart ?? (
                <Link
                  href="/carrinho"
                  aria-label={`Carrinho, ${cartCount} ${cartCount === 1 ? "item" : "itens"}`}
                  className="relative flex size-11 items-center justify-center rounded text-ink hover:bg-subtle"
                >
                  <ShoppingBagIcon className="size-5" />
                  {cartCount > 0 && (
                    <span
                      aria-hidden
                      className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-label-sm text-primary-foreground"
                    >
                      {cartCount}
                    </span>
                  )}
                </Link>
              )}
            </li>
          </ul>
        </nav>
      </PageContainer>
      <nav
        aria-label="Categorias"
        className="hidden border-t border-line-subtle lg:block"
      >
        <PageContainer>
          <ul className="flex h-12 items-center gap-lg">
            {categories.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded text-label text-ink-muted hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </PageContainer>
      </nav>
    </header>
  )
}
