import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { EMAIL_TOKENS, EMAIL_TOKEN_SOURCES } from "@/emails/email-tokens"
import { escapeHtml, textToEmailHtml } from "@/emails/layout"
import {
  approvalPendingEmail,
  invoiceIssuedEmail,
  orderCanceledEmail,
  orderDeliveredEmail,
  orderShippedEmail,
  paymentConfirmedEmail,
  quoteEmail,
  supportTicketEmail,
  welcomeEmail,
} from "@/emails/templates"

const order = {
  name: "Cliente Fictício",
  number: "AB-2026-000123",
  total: "4890.5",
  url: "https://loja.test/conta/pedidos",
}

const all = {
  welcome: welcomeEmail({
    name: "Cliente Fictício",
    corporate: false,
    url: "https://loja.test/conta",
  }),
  quoteReceived: quoteEmail({
    name: "Cliente Fictício",
    number: "COT-2026-000001",
    stage: "received",
    url: "https://loja.test/conta/cotacoes",
  }),
  quoteAnswered: quoteEmail({
    name: "Cliente Fictício",
    number: "COT-2026-000001",
    stage: "answered",
    validUntil: "26/11/2026",
    url: "https://loja.test/conta/cotacoes",
  }),
  approval: approvalPendingEmail({ ...order, requester: "Solicitante" }),
  paid: paymentConfirmedEmail(order),
  invoiced: invoiceIssuedEmail({ ...order, accessKey: "3526 1100 0000" }),
  shipped: orderShippedEmail({
    ...order,
    carrier: "Transportadora Fictícia",
    trackingCode: "BR123",
  }),
  delivered: orderDeliveredEmail(order),
  canceled: orderCanceledEmail({ ...order, reason: "Pix não pago." }),
  ticket: supportTicketEmail({
    name: "Cliente Fictício",
    number: "CH-0001",
    status: "Em atendimento",
    message: "Recebemos seu chamado.",
    url: "https://loja.test/conta/chamados",
  }),
}

describe("transactional e-mail templates (#67, RF53)", () => {
  it.each(Object.entries(all))(
    "%s is responsive, in Portuguese and has a text version",
    (_name, email) => {
      expect(email.html).toContain('<html lang="pt-BR">')
      expect(email.html).toContain(
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
      )
      expect(email.html).toContain("@media (max-width: 620px)")
      expect(email.html).toContain("max-width:100%")
      expect(email.text).toContain("Atelier Bureau")
      expect(email.subject.length).toBeGreaterThan(0)
      expect(email.template).toMatch(/^[a-z_.]+$/)
    }
  )

  it("shows the order number, total and tracking data", () => {
    expect(all.paid.text).toContain("Pedido: AB-2026-000123")
    expect(all.paid.text).toMatch(/Total: R\$\s4\.890,50/)
    expect(all.shipped.html).toContain("BR123")
    expect(all.invoiced.text).toContain("Chave de acesso: 3526 1100 0000")
    expect(all.paid.html).toContain('href="https://loja.test/conta/pedidos"')
  })

  it("escapes names typed by users", () => {
    const email = paymentConfirmedEmail({
      ...order,
      name: '<script>alert("x")</script>',
    })
    expect(email.html).not.toContain("<script>")
    expect(email.html).toContain("&lt;script&gt;")
    expect(escapeHtml(`a&b"'`)).toBe("a&amp;b&quot;&#39;")
  })

  it("wraps plain text e-mails in the brand layout", () => {
    const html = textToEmailHtml(
      "Olá, Ana.\n\nUse este link: https://loja.test/x",
      "Redefinição de senha"
    )
    expect(html).toContain("Redefinição de senha")
    expect(html).toContain("Use este link: https://loja.test/x")
  })

  it("uses the colors of the design system tokens (RNF15)", () => {
    const css = readFileSync(join(process.cwd(), "app/tokens.css"), "utf8")
    for (const [key, variable] of Object.entries(EMAIL_TOKEN_SOURCES)) {
      const match = css.match(new RegExp(`${variable}:\\s*(#[0-9a-fA-F]{6})`))
      expect(match?.[1]?.toLowerCase()).toBe(
        EMAIL_TOKENS[key as keyof typeof EMAIL_TOKEN_SOURCES]
      )
    }
  })
})
