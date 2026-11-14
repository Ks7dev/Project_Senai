import "server-only"
import { z } from "zod"
import { logger } from "@/features/shared/lib/logger/logger"

/** NF-e provider settings, read from the environment (homologation). */
export type NfeConfig = {
  /** API base URL. */
  baseUrl: string
  /** Token of the issuer company (never sent to the browser). */
  token: string
  /** Timeout of each request, in milliseconds. */
  timeoutMs: number
}

/** Why a call to the NF-e provider failed. */
export type NfeErrorKind =
  /** No token in the environment. */
  | "not_configured"
  /** The provider refused the request (4xx): data to fix. */
  | "refused"
  /** Timeout, network error or 5xx: try again later. */
  | "unavailable"
  /** The NF-e reference does not exist in the provider. */
  | "not_found"

/** Failure of an NF-e provider call; carries only a safe message. */
export class NfeError extends Error {
  /**
   * Creates the error.
   *
   * @param kind - What went wrong.
   * @param publicMessage - Provider message safe to show to the back
   * office (validation or SEFAZ text), when there is one.
   * @param status - HTTP status, when there was an answer.
   */
  constructor(
    public readonly kind: NfeErrorKind,
    public readonly publicMessage: string | null = null,
    public readonly status?: number
  ) {
    super(`NF-e provider ${kind}${status ? ` (${status})` : ""}`)
    this.name = "NfeError"
  }
}

/** Status of an NF-e in the provider, reduced to what the store uses. */
export type ProviderNfe =
  | { status: "processing" }
  | {
      status: "authorized"
      accessKey: string
      number: string | null
      series: string | null
      protocol: string | null
      xmlPath: string | null
      danfePath: string | null
    }
  | { status: "rejected"; message: string }
  | { status: "canceled" }

const DEFAULT_BASE_URL = "https://homologacao.focusnfe.com.br"
const DEFAULT_TIMEOUT_MS = 15_000

/**
 * NF-e provider settings from the environment. Without the token the
 * issuance stays failed (with an alert) until it is configured.
 *
 * @returns The settings, or null when the token is missing.
 */
export function nfeConfig(): NfeConfig | null {
  const token = process.env.NFE_API_TOKEN?.trim() ?? ""
  if (!token) return null
  const timeout = Number(process.env.NFE_TIMEOUT_MS)
  return {
    baseUrl: (process.env.NFE_API_BASE_URL || DEFAULT_BASE_URL).replace(
      /\/+$/,
      ""
    ),
    token,
    timeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  }
}

const errorBodySchema = z
  .object({
    mensagem: z.string().nullish(),
    erros: z
      .array(z.object({ mensagem: z.string().nullish() }).passthrough())
      .nullish(),
  })
  .passthrough()

/**
 * Safe message of a provider error body (validation text only).
 *
 * @param body - Parsed JSON body.
 * @returns The message, at most 400 characters, or null.
 */
function errorMessage(body: unknown): string | null {
  const parsed = errorBodySchema.safeParse(body)
  if (!parsed.success) return null
  const messages = [
    parsed.data.mensagem,
    ...(parsed.data.erros ?? []).map((item) => item.mensagem),
  ].filter((text): text is string => !!text)
  return messages.length > 0 ? messages.join(" ").slice(0, 400) : null
}

/**
 * Calls the NF-e provider with the timeout and HTTP Basic auth (token as
 * user). Logs carry only the operation and the HTTP status, never
 * headers, payload or personal data.
 *
 * @param operation - Short name for the logs.
 * @param path - API path, with the query string.
 * @param init - Method and body.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The response, already checked for success.
 * @throws NfeError.
 */
async function callNfe(
  operation: string,
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
  fetcher: typeof fetch
): Promise<Response> {
  const config = nfeConfig()
  if (!config) {
    logger.warn("nfe provider not configured", { operation })
    throw new NfeError("not_configured")
  }
  let response: Response
  try {
    response = await fetcher(`${config.baseUrl}${path}`, {
      method: init.method,
      headers: {
        Accept: "application/json",
        ...(init.body === undefined
          ? {}
          : { "Content-Type": "application/json" }),
        Authorization: `Basic ${Buffer.from(`${config.token}:`).toString("base64")}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(config.timeoutMs),
      cache: "no-store",
    })
  } catch (error) {
    logger.warn("nfe provider unavailable", {
      operation,
      error: error instanceof Error ? error.name : "unknown",
    })
    throw new NfeError("unavailable")
  }
  if (response.ok) return response
  logger.warn("nfe provider request failed", {
    operation,
    status: response.status,
  })
  if (response.status === 404) throw new NfeError("not_found", null, 404)
  if (response.status >= 500 || response.status === 429) {
    throw new NfeError("unavailable", null, response.status)
  }
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }
  throw new NfeError("refused", errorMessage(body), response.status)
}

/**
 * Sends an NF-e to the provider (`POST /v2/nfe?ref=`). The reference is
 * our invoice id, so sending the same NF-e again never issues two.
 *
 * @param ref - Our invoice id.
 * @param payload - NF-e data built by `buildNfePayload`.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @throws NfeError.
 */
export async function submitNfe(
  ref: string,
  payload: Record<string, unknown>,
  fetcher: typeof fetch = fetch
): Promise<void> {
  await callNfe(
    "submit_nfe",
    `/v2/nfe?ref=${encodeURIComponent(ref)}`,
    { method: "POST", body: payload },
    fetcher
  )
}

const statusSchema = z
  .object({
    status: z.string(),
    chave_nfe: z.string().nullish(),
    numero: z.union([z.string(), z.number()]).nullish(),
    serie: z.union([z.string(), z.number()]).nullish(),
    protocolo: z.union([z.string(), z.number()]).nullish(),
    caminho_xml_nota_fiscal: z.string().nullish(),
    caminho_danfe: z.string().nullish(),
    mensagem_sefaz: z.string().nullish(),
    status_sefaz: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough()

/**
 * Reads the status of an NF-e (`GET /v2/nfe/{ref}`).
 *
 * @param ref - Our invoice id.
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The status.
 * @throws NfeError.
 */
export async function getNfe(
  ref: string,
  fetcher: typeof fetch = fetch
): Promise<ProviderNfe> {
  const response = await callNfe(
    "get_nfe",
    `/v2/nfe/${encodeURIComponent(ref)}`,
    { method: "GET" },
    fetcher
  )
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new NfeError("unavailable")
  }
  const parsed = statusSchema.safeParse(raw)
  if (!parsed.success) {
    logger.warn("nfe provider returned an unexpected payload")
    throw new NfeError("unavailable")
  }
  const data = parsed.data
  const text = (value: string | number | null | undefined) =>
    value === null || value === undefined ? null : String(value)
  switch (data.status) {
    case "autorizado": {
      const accessKey = (data.chave_nfe ?? "").replace(/\D/g, "")
      if (accessKey.length !== 44) throw new NfeError("unavailable")
      return {
        status: "authorized",
        accessKey,
        number: text(data.numero),
        series: text(data.serie),
        protocol: text(data.protocolo),
        xmlPath: data.caminho_xml_nota_fiscal ?? null,
        danfePath: data.caminho_danfe ?? null,
      }
    }
    case "erro_autorizacao":
    case "denegado":
      return {
        status: "rejected",
        message: [
          data.status_sefaz ? `SEFAZ ${data.status_sefaz}` : null,
          data.mensagem_sefaz ?? "NF-e rejeitada pela SEFAZ.",
        ]
          .filter(Boolean)
          .join(": ")
          .slice(0, 400),
      }
    case "cancelado":
      return { status: "canceled" }
    default:
      return { status: "processing" }
  }
}

/**
 * Downloads a file of an authorized NF-e (XML or DANFE) from the path
 * the provider returned. Only paths of the provider itself are allowed.
 *
 * @param path - Path such as "/arquivos/.../nfe.xml".
 * @param fetcher - Fetch implementation (replaced in tests).
 * @returns The file contents.
 * @throws NfeError.
 */
export async function downloadNfeFile(
  path: string,
  fetcher: typeof fetch = fetch
): Promise<Buffer> {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
    throw new NfeError("refused", "Caminho de arquivo inválido.")
  }
  const response = await callNfe(
    "download_nfe_file",
    path,
    { method: "GET" },
    fetcher
  )
  try {
    return Buffer.from(await response.arrayBuffer())
  } catch {
    throw new NfeError("unavailable")
  }
}
