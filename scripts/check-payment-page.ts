import { pathToFileURL } from "node:url"
import baseline from "../deploy/payment-page-baseline.json" with { type: "json" }
import {
  checkPaymentPage,
  type PaymentPageBaseline,
} from "../features/shared/lib/security/payment-page-monitor"

/** Order id used when none is given: the page still sends its CSP. */
const PLACEHOLDER_ORDER = "verificacao"

/** Options of the check, read from the command line and environment. */
export type CheckOptions = {
  /** Base URL of the store, e.g. `https://192.168.0.50`. */
  baseUrl: string
  /** Order whose payment page is fetched. */
  orderId: string
  /** Session cookie of a customer, to check the scripts of the HTML. */
  cookie?: string
}

/**
 * Reads the options from the arguments and the environment.
 *
 * @param argv - Arguments after the script name.
 * @param env - Environment variables.
 * @returns The options, or `null` when the base URL is missing.
 */
export function parseOptions(
  argv: string[],
  env: Record<string, string | undefined>
): CheckOptions | null {
  const [baseUrl, orderId] = argv
  if (!baseUrl) return null
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    orderId: orderId || PLACEHOLDER_ORDER,
    cookie: env.PAYMENT_CHECK_COOKIE || undefined,
  }
}

/**
 * Fetches the payment page and compares its CSP and scripts with the
 * versioned baseline (`deploy/payment-page-baseline.json`), detecting
 * an unauthorized change of the payment page (#173, PCI 11.6.1). Without
 * a session cookie the page redirects to the login, so only the CSP is
 * checked.
 *
 * Usage (scheduled on the server, e.g. every hour by cron):
 *
 *   NODE_EXTRA_CA_CERTS=deploy/certs/root.crt \
 *     npx tsx scripts/check-payment-page.ts https://192.168.0.50 [orderId]
 *
 * @param options - Check options.
 * @param fetchImpl - Fetch implementation (replaced in tests).
 * @returns Divergences found; empty when the page matches the baseline.
 */
export async function checkRemotePaymentPage(
  options: CheckOptions,
  fetchImpl: typeof fetch = fetch
): Promise<string[]> {
  const url = `${options.baseUrl}/conta/pedidos/${encodeURIComponent(options.orderId)}/pagamento`
  const response = await fetchImpl(url, {
    redirect: "manual",
    headers: options.cookie ? { cookie: options.cookie } : {},
    signal: AbortSignal.timeout(10_000),
  })
  const csp = response.headers.get("content-security-policy")
  const html = response.status === 200 ? await response.text() : null
  return checkPaymentPage(baseline as PaymentPageBaseline, csp, html)
}

/**
 * Runs the check and reports the result. Exits with 1 on any
 * divergence, so a scheduler or CI raises the alert.
 *
 * @returns Process exit code.
 */
export async function main(): Promise<number> {
  const options = parseOptions(process.argv.slice(2), process.env)
  if (!options) {
    process.stderr.write(
      "Uso: npx tsx scripts/check-payment-page.ts <url-base> [id-do-pedido]\n"
    )
    return 2
  }
  try {
    const problems = await checkRemotePaymentPage(options)
    if (problems.length === 0) {
      process.stdout.write(
        "OK: CSP e scripts da página de pagamento iguais ao baseline.\n"
      )
      return 0
    }
    for (const problem of problems) {
      process.stderr.write(`ALERTA: ${problem}\n`)
    }
    process.stderr.write(
      `${problems.length} divergência(s) na página de pagamento. Confira a mudança e, se aprovada, atualize deploy/payment-page-baseline.json e o inventário.\n`
    )
    return 1
  } catch {
    process.stderr.write("ALERTA: página de pagamento sem resposta.\n")
    return 1
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code))
}
