import { Suspense } from "react"
import { connection } from "next/server"
import { CartPageView } from "@/features/cart/cart-page/cart-view"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  loadCartExtrasRules,
  loadCurrentCart,
} from "@/features/shared/lib/cart/cart-store"

export const metadata = { title: "Carrinho — Atelier Bureau" }

/**
 * Loads the active cart: the account cart when logged in (user id from
 * the session), the visitor cart otherwise.
 *
 * @returns The cart page.
 */
async function CartContent() {
  // Request time only: the cart and its rules are never read in the build
  await connection()
  const [user, cart, rules] = await Promise.all([
    getCurrentUser(),
    loadCurrentCart(),
    loadCartExtrasRules(),
  ])
  return <CartPageView cart={cart} loggedIn={user !== null} rules={rules} />
}

/**
 * Cart route (#46, RF07).
 *
 * @returns The page.
 */
export default function CartPage() {
  return (
    <Suspense fallback={<p className="p-xl text-body">Carregando carrinho…</p>}>
      <CartContent />
    </Suspense>
  )
}
