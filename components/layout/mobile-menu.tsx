"use client"

import Link from "next/link"
import { MenuIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import type { NavLink } from "@/features/shared/config/navigation"

type MobileMenuProps = {
  /** Category links of the main menu. */
  categories: NavLink[]
  /** Account and service links. */
  services: NavLink[]
}

/**
 * Mobile and tablet menu in a side sheet. The sheet traps focus,
 * closes with Esc and returns focus to the trigger.
 *
 * @param props - Category and service links.
 * @returns The menu trigger and sheet.
 */
export function MobileMenu({ categories, services }: MobileMenuProps) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="border-transparent lg:hidden"
            aria-label="Abrir menu"
          />
        }
      >
        <MenuIcon />
      </SheetTrigger>
      <SheetContent side="left" className="w-80 bg-canvas">
        <SheetHeader>
          <SheetTitle className="font-serif text-headline-sm">
            Atelier Bureau
          </SheetTitle>
          <SheetDescription className="sr-only">
            Navegação principal da loja
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Menu principal" className="flex flex-col px-md">
          <p className="pb-sm text-caps text-clay uppercase">Categorias</p>
          <ul className="flex flex-col">
            {categories.map((link) => (
              <li key={link.href}>
                <SheetClose
                  nativeButton={false}
                  render={
                    <Link
                      href={link.href}
                      className="block rounded py-3 text-body text-ink hover:text-primary"
                    />
                  }
                >
                  {link.label}
                </SheetClose>
              </li>
            ))}
          </ul>
          <p className="pt-lg pb-sm text-caps text-clay uppercase">
            Atendimento
          </p>
          <ul className="flex flex-col">
            {services.map((link) => (
              <li key={link.href}>
                <SheetClose
                  nativeButton={false}
                  render={
                    <Link
                      href={link.href}
                      className="block rounded py-3 text-body text-ink hover:text-primary"
                    />
                  }
                >
                  {link.label}
                </SheetClose>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
