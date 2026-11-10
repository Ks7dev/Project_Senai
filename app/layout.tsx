import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Atelier Bureau",
  description: "Papelaria nobre e mobiliário executivo para empresas e pessoas",
}

/**
 * Root layout shared by every route of the store.
 *
 * @param props - Layout props with the rendered route as children.
 * @returns The HTML document shell.
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  )
}
