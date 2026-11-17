import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"
import { POST as cspReport } from "@/app/api/csp-report/route"
import { proxy } from "@/proxy"
import baseline from "@/deploy/payment-page-baseline.json"
import { parseCspReport } from "@/features/shared/lib/security/csp-report"
import {
  buildContentSecurityPolicy,
  buildPaymentContentSecurityPolicy,
  createNonce,
  isPaymentPagePath,
  MERCADO_PAGO_CSP_HOSTS,
  NONCE_HEADER,
  STATIC_CSP_SOURCE,
} from "@/features/shared/lib/security/headers"
import {
  checkPaymentPage,
  checkScripts,
  diffCsp,
  extractScripts,
  NONCE_PLACEHOLDER,
  parseCsp,
  type PaymentPageBaseline,
} from "@/features/shared/lib/security/payment-page-monitor"
import {
  checkRemotePaymentPage,
  parseOptions,
} from "@/scripts/check-payment-page"

const approved = baseline as PaymentPageBaseline

afterEach(() => {
  vi.restoreAllMocks()
})

describe("payment page CSP with nonce (#173)", () => {
  const policy = buildPaymentContentSecurityPolicy(false, "abc123")
  const scriptSrc = parseCsp(policy).get("script-src") ?? []

  it("matches only the payment page path", () => {
    expect(isPaymentPagePath("/conta/pedidos/abc/pagamento")).toBe(true)
    expect(isPaymentPagePath("/conta/pedidos/abc/pagamento/")).toBe(true)
    expect(isPaymentPagePath("/conta/pedidos/abc")).toBe(false)
    expect(isPaymentPagePath("/conta/pedidos/a/b/pagamento")).toBe(false)
    expect(isPaymentPagePath("/carrinho")).toBe(false)
  })

  it("allows inline scripts only with the nonce", () => {
    expect(scriptSrc).toContain("'nonce-abc123'")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
    expect(scriptSrc).not.toContain("'strict-dynamic'")
  })

  it("reports violations to the log route", () => {
    expect(policy).toContain("report-uri /api/csp-report")
    expect(policy).toContain("report-to csp-endpoint")
  })

  it("only allows eval in development", () => {
    expect(buildPaymentContentSecurityPolicy(true, "n")).toContain(
      "'unsafe-eval'"
    )
  })

  it("creates a different 128-bit nonce for each request", () => {
    const first = createNonce()
    expect(first).toMatch(/^[A-Za-z0-9+/]{22}==$/)
    expect(createNonce()).not.toBe(first)
  })

  it("keeps the static CSP off the payment page in next.config", () => {
    const require = createRequire(import.meta.url)
    const { pathToRegexp } = require("next/dist/compiled/path-to-regexp") as {
      pathToRegexp: (path: string, keys: unknown[], options: object) => RegExp
    }
    const regex = pathToRegexp(STATIC_CSP_SOURCE, [], { strict: true })
    expect(regex.test("/")).toBe(true)
    expect(regex.test("/produtos/caneta")).toBe(true)
    expect(regex.test("/conta/pedidos/abc")).toBe(true)
    expect(regex.test("/conta/pedidos/abc/pagamento")).toBe(false)
  })

  it("sets the CSP and the nonce in the proxy, only on the payment page", () => {
    const response = proxy(
      new NextRequest("https://loja.test/conta/pedidos/abc/pagamento", {
        headers: { [NONCE_HEADER]: "forged" },
      })
    )
    const csp = response.headers.get("content-security-policy") ?? ""
    const nonce = response.headers.get(`x-middleware-request-${NONCE_HEADER}`)
    expect(nonce).toBeTruthy()
    expect(nonce).not.toBe("forged")
    expect(csp).toContain(`'nonce-${nonce}'`)
    expect(response.headers.get("reporting-endpoints")).toBe(
      'csp-endpoint="/api/csp-report"'
    )

    const other = proxy(new NextRequest("https://loja.test/carrinho"))
    expect(other.headers.get("content-security-policy")).toBeNull()
    expect(other.headers.get(`x-middleware-request-${NONCE_HEADER}`)).toBeNull()
  })
})

describe("Mercado Pago hosts (#174)", () => {
  it("never uses wildcard domains", () => {
    const all = Object.values(MERCADO_PAGO_CSP_HOSTS).flat()
    for (const host of all) {
      expect(host).toMatch(/^https:\/\/[a-z0-9.-]+$/)
    }
    expect(buildContentSecurityPolicy(false)).not.toContain("*")
    expect(buildPaymentContentSecurityPolicy(false, "n")).not.toContain("*")
  })
})

describe("payment page baseline and inventory (#173, PCI 6.4.3)", () => {
  it("is the CSP the app sends; a change needs an approved baseline", () => {
    expect(
      diffCsp(
        approved.contentSecurityPolicy,
        buildPaymentContentSecurityPolicy(false, NONCE_PLACEHOLDER)
      )
    ).toEqual([])
  })

  it("lists every approved script in the versioned inventory", () => {
    const doc = readFileSync(
      join(process.cwd(), "docs/AtelierBureau_PCI_DSS_SAQ_A.md"),
      "utf8"
    )
    for (const script of approved.scripts) {
      expect(doc).toContain(script.src)
    }
    expect(doc).toContain("deploy/payment-page-baseline.json")
  })
})

describe("payment page change detection (#173, PCI 11.6.1)", () => {
  const csp = approved.contentSecurityPolicy.replace(NONCE_PLACEHOLDER, "n1")

  it("ignores the nonce value and the order of the sources", () => {
    const reordered = csp.replace(
      "'self' 'nonce-n1' https://sdk.mercadopago.com",
      "https://sdk.mercadopago.com 'nonce-other' 'self'"
    )
    expect(diffCsp(approved.contentSecurityPolicy, reordered)).toEqual([])
  })

  it("flags new, removed and loosened sources", () => {
    const changed = csp
      .replace("script-src 'self'", "script-src 'self' https://evil.example")
      .replace("; object-src 'none'", "")
    expect(diffCsp(approved.contentSecurityPolicy, changed)).toEqual([
      "script-src: origem https://evil.example não aprovada",
      "diretiva object-src ausente",
    ])
    expect(
      checkPaymentPage(
        approved,
        csp.replace("'nonce-n1'", "'unsafe-inline'"),
        null
      )
    ).toContain("script-src com 'unsafe-inline'")
    expect(checkPaymentPage(approved, null, null)).toEqual([
      "cabeçalho Content-Security-Policy ausente",
    ])
  })

  it("checks the scripts of the HTML against the inventory and the nonce", () => {
    const html = [
      '<script src="/_next/static/chunks/main.js" nonce="n1" async></script>',
      '<script nonce="n1">self.__next_f.push([1])</script>',
      '<script type="application/ld+json">{}</script>',
      '<script src="https://evil.example/x.js" nonce="n1"></script>',
      "<script>alert(1)</script>",
    ].join("")
    const scripts = extractScripts(html)
    expect(scripts).toHaveLength(4)
    expect(checkScripts(scripts, approved.scripts, "n1")).toEqual([
      "script fora do inventário: https://evil.example/x.js",
      "script inline nº 4 sem o nonce da CSP",
    ])
    expect(checkPaymentPage(approved, csp, html.slice(0, 120))).toEqual([])
  })

  it("fetches the page and compares it with the baseline", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(null, {
          status: 307,
          headers: { "content-security-policy": csp },
        })
    )
    const options = parseOptions(["https://loja.test/"], {})!
    expect(options.baseUrl).toBe("https://loja.test")
    expect(
      await checkRemotePaymentPage(options, fetchImpl as typeof fetch)
    ).toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://loja.test/conta/pedidos/verificacao/pagamento",
      expect.objectContaining({ redirect: "manual" })
    )
    expect(parseOptions([], {})).toBeNull()
  })

  it("checks the payment page CSP in the network header check", () => {
    const check = readFileSync(
      join(process.cwd(), "deploy/check-headers.sh"),
      "utf8"
    )
    expect(check).toContain("/pagamento")
    expect(check).toContain("'unsafe-inline'")
    expect(check).toContain("'nonce-")
  })
})

describe("CSP violation reports (#173)", () => {
  it("parses both report formats keeping no personal data", () => {
    const legacy = JSON.stringify({
      "csp-report": {
        "document-uri": "https://loja.test/conta/pedidos/abc/pagamento?x=1",
        "blocked-uri": "https://evil.example/steal.js?card=4111",
        "effective-directive": "script-src-elem",
      },
    })
    expect(parseCspReport(legacy)).toEqual([
      {
        directive: "script-src-elem",
        blocked: "https://evil.example",
        page: "/conta/pedidos/[id]/pagamento",
        disposition: "enforce",
      },
    ])
    const reporting = JSON.stringify([
      {
        type: "csp-violation",
        body: {
          documentURL: "https://loja.test/conta/pedidos/abc/pagamento",
          blockedURL: "inline",
          effectiveDirective: "script-src-elem",
          disposition: "enforce",
        },
      },
      { type: "deprecation", body: {} },
    ])
    expect(parseCspReport(reporting)).toHaveLength(1)
    expect(parseCspReport(reporting)[0].blocked).toBe("inline")
    expect(parseCspReport("not json")).toEqual([])
    expect(parseCspReport("x".repeat(20_000))).toEqual([])
  })

  it("only logs the report and answers 204", async () => {
    // The logger writes warnings to stderr
    const write = vi.spyOn(console, "error").mockImplementation(() => {})
    const response = await cspReport(
      new Request("https://loja.test/api/csp-report", {
        method: "POST",
        headers: { "content-type": "application/csp-report" },
        body: JSON.stringify({
          "csp-report": {
            "document-uri": "https://loja.test/conta/pedidos/abc/pagamento",
            "blocked-uri": "inline",
            "effective-directive": "script-src-elem",
          },
        }),
      })
    )
    expect(response.status).toBe(204)
    expect(write.mock.calls.flat().join(" ")).toContain("csp violation")
  })
})
