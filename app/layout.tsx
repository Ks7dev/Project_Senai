import type { Metadata } from "next"
import { Playfair_Display, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
})

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  display: "swap",
})

export const metadata: Metadata = {
  title: "Atelier Bureau",
  description: "Papelaria nobre e mobiliário executivo para empresas e pessoas",
}

/**
 * Root layout shared by every route of the store. Loads the design
 * system fonts (Playfair Display and Plus Jakarta Sans).
 *
 * @param props - Layout props with the rendered route as children.
 * @returns The HTML document shell.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${playfair.variable} ${jakarta.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
