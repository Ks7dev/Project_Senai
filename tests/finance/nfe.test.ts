import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { nfeFailureAlertEmail } from "@/emails/templates"
import {
  getNfe,
  NfeError,
  submitNfe,
} from "@/features/shared/lib/nfe/nfe-client"
import {
  allocateCents,
  buildNfePayload,
  HOMOLOGATION_RECIPIENT,
  NfePayloadError,
  type NfeOrder,
} from "@/features/shared/lib/nfe/nfe-payload"

const saveFile = vi.fn()
const db = {
  $transaction: vi.fn(),
  invoice: {
    upsert: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
  },
  setting: { findUnique: vi.fn() },
  user: { findMany: vi.fn() },
  order: { findUnique: vi.fn() },
  emailOutbox: { create: vi.fn() },
  auditLog: { create: vi.fn() },
}

vi.mock("@/features/shared/lib/db/prisma", () => ({ prisma: db }))
vi.mock("@/features/shared/lib/storage/storage", () => ({
  saveFile: (...args: unknown[]) => saveFile(...args),
  readStoredFile: vi.fn(),
}))

const { nextRetryAt, processInvoice, queueInvoiceIssuance } =
  await import("@/features/shared/lib/nfe/nfe-service")

const issuer = {
  cnpj: "12345678000195",
  name: "Emitente Fictício",
  state: "SP",
}
const defaults = {
  operationNature: "Venda de mercadoria",
  ncm: "48201000",
  cfopSameState: "5102",
  cfopOtherState: "6102",
  icmsSituation: "102",
  pisCofinsSituation: "07",
}
const address = {
  street: "Rua Fictícia",
  number: "100",
  complement: "Sala 2",
  district: "Centro",
  city: "São Paulo",
  state: "SP",
  cep: "01001000",
}
const now = new Date("2026-11-14T15:00:00.000Z")
const invoiceId = "019a7b1e-0000-7000-8000-000000000301"
const orderId = "019a7b1e-0000-7000-8000-000000000302"
const accessKey = "35261112345678000195550010000000011000000010"

/**
 * An order as the NF-e builder reads it.
 *
 * @param change - Fields to override.
 * @returns The order.
 */
function nfeOrder(change: Partial<NfeOrder> = {}): NfeOrder {
  return {
    number: "AB-2026-000301",
    document: "52998224725",
    shippingAddress: address,
    shippingTotal: "10.00",
    discount: "0.01",
    servicesTotal: "90.00",
    items: [
      {
        skuCode: "CAN-01",
        productName: "Caneta tinteiro",
        quantity: 2,
        unitPrice: "100.00",
      },
      {
        skuCode: "CAD-01",
        productName: "Caderno",
        quantity: 1,
        unitPrice: "50.00",
      },
    ],
    ...change,
  }
}

describe("NF-e payload (RF13)", () => {
  it("uses the homologation recipient, the CPF and the same state CFOP", () => {
    const payload = buildNfePayload(nfeOrder(), issuer, defaults, now)
    expect(payload).toMatchObject({
      nome_destinatario: HOMOLOGATION_RECIPIENT,
      cpf_destinatario: "52998224725",
      cnpj_emitente: "12345678000195",
      local_destino: 1,
      uf_destinatario: "SP",
    })
    const items = payload.items as Array<Record<string, unknown>>
    expect(items.map((item) => item.cfop)).toEqual(["5102", "5102"])
    expect(items[0]).toMatchObject({
      codigo_ncm: "48201000",
      valor_bruto: "200.00",
      valor_frete: "8.00",
    })
    expect(items[1]).toMatchObject({
      valor_frete: "2.00",
      valor_desconto: "0.01",
    })
    expect(String(payload.informacoes_adicionais_contribuinte)).toContain(
      "sem valor fiscal"
    )
    expect(String(payload.informacoes_adicionais_contribuinte)).toContain(
      "90,00"
    )
  })

  it("uses the CNPJ and the other state CFOP", () => {
    const payload = buildNfePayload(
      nfeOrder({
        document: "11222333000181",
        shippingAddress: { ...address, state: "RJ" },
      }),
      issuer,
      defaults,
      now
    )
    expect(payload.cnpj_destinatario).toBe("11222333000181")
    expect(payload.local_destino).toBe(2)
    expect(
      (payload.items as Array<{ cfop: string }>).every(
        (item) => item.cfop === "6102"
      )
    ).toBe(true)
  })

  it("refuses an order without the address or the document", () => {
    expect(() =>
      buildNfePayload(
        nfeOrder({ shippingAddress: { city: "São Paulo" } }),
        issuer,
        defaults,
        now
      )
    ).toThrow(NfePayloadError)
    expect(() =>
      buildNfePayload(nfeOrder({ document: "123" }), issuer, defaults, now)
    ).toThrow(NfePayloadError)
  })

  it("splits an amount by item and keeps the cents", () => {
    expect(allocateCents(1000, [20000, 5000])).toEqual([800, 200])
    expect(allocateCents(100, [1, 1, 1])).toEqual([33, 33, 34])
    expect(allocateCents(0, [1, 2])).toEqual([0, 0])
  })
})

describe("NF-e provider client", () => {
  beforeEach(() => {
    vi.stubEnv("NFE_API_TOKEN", "token-homologacao")
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => vi.unstubAllEnvs())

  it("sends the NF-e with the reference and HTTP Basic auth", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 202 }))
    await submitNfe(invoiceId, { a: 1 }, fetcher as unknown as typeof fetch)
    const [url, init] = fetcher.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toBe(
      `https://homologacao.focusnfe.com.br/v2/nfe?ref=${invoiceId}`
    )
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("token-homologacao:").toString("base64")}`
    )
  })

  it("reads the authorized, rejected and processing statuses", async () => {
    const reply = (body: unknown) =>
      vi.fn(
        async () => new Response(JSON.stringify(body), { status: 200 })
      ) as unknown as typeof fetch
    expect(
      await getNfe(
        invoiceId,
        reply({
          status: "autorizado",
          chave_nfe: `NFe${accessKey}`,
          numero: 1,
          serie: "1",
          caminho_xml_nota_fiscal: "/arquivos/nfe.xml",
          caminho_danfe: "/arquivos/danfe.pdf",
        })
      )
    ).toMatchObject({ status: "authorized", accessKey, number: "1" })
    expect(
      await getNfe(
        invoiceId,
        reply({
          status: "erro_autorizacao",
          status_sefaz: "539",
          mensagem_sefaz: "Duplicidade de NF-e",
        })
      )
    ).toEqual({ status: "rejected", message: "SEFAZ 539: Duplicidade de NF-e" })
    expect(
      await getNfe(invoiceId, reply({ status: "processando_autorizacao" }))
    ).toEqual({ status: "processing" })
  })

  it("keeps the validation message of a refusal and fails without token", async () => {
    const refused = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            codigo: "requisicao_invalida",
            mensagem: "CEP inválido",
          }),
          { status: 422 }
        )
    )
    await expect(
      submitNfe(invoiceId, {}, refused as unknown as typeof fetch)
    ).rejects.toMatchObject({ kind: "refused", publicMessage: "CEP inválido" })
    vi.stubEnv("NFE_API_TOKEN", "")
    await expect(submitNfe(invoiceId, {})).rejects.toBeInstanceOf(NfeError)
  })
})

/** Resets every mock of the fake Prisma. */
function resetDb() {
  for (const group of Object.values(db)) {
    if (typeof group === "function") group.mockReset()
    else for (const fn of Object.values(group)) fn.mockReset()
  }
  saveFile.mockReset()
  db.$transaction.mockImplementation((run: (client: typeof db) => unknown) =>
    run(db)
  )
  db.setting.findUnique.mockImplementation(
    ({ where }: { where: { key: string } }) => ({
      key: where.key,
      value: where.key === "invoice.issuer" ? issuer : defaults,
    })
  )
  db.emailOutbox.create.mockResolvedValue({ id: "email-1" })
  db.invoice.updateMany.mockResolvedValue({ count: 1 })
  db.user.findMany.mockResolvedValue([])
}

/**
 * An NF-e row as the service reads it.
 *
 * @param change - Fields to override.
 * @returns The row.
 */
function invoiceRow(change: Record<string, unknown> = {}) {
  const decimal = (value: string) => ({ toFixed: () => value })
  return {
    id: invoiceId,
    orderId,
    attempts: 0,
    alertedAt: null,
    submittedAt: null,
    order: {
      number: "AB-2026-000301",
      shippingAddress: address,
      shippingTotal: decimal("10.00"),
      discount: decimal("0.00"),
      servicesTotal: decimal("0.00"),
      user: { document: "52998224725" },
      organization: null,
      items: [
        {
          skuCode: "CAN-01",
          productName: "Caneta",
          quantity: 1,
          unitPrice: decimal("100.00"),
        },
      ],
    },
    ...change,
  }
}

/**
 * A fake provider that answers by method and path.
 *
 * @param routes - Answers keyed by "METHOD path".
 * @returns The fetch mock.
 */
function provider(routes: Record<string, () => Response>) {
  return vi.fn(async (url: string, init: RequestInit) => {
    const path = new URL(url).pathname
    const answer = routes[`${init.method} ${path}`]
    if (!answer) return new Response("{}", { status: 404 })
    return answer()
  })
}

describe("NF-e issuance (#63)", () => {
  beforeEach(() => {
    vi.stubEnv("NFE_API_TOKEN", "token-homologacao")
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.spyOn(console, "error").mockImplementation(() => {})
    resetDb()
  })
  afterEach(() => vi.unstubAllEnvs())

  it("queues the NF-e when the order is confirmed", async () => {
    await queueInvoiceIssuance(db as never, { orderId, now })
    expect(db.invoice.upsert).toHaveBeenCalledWith({
      where: { orderId },
      create: expect.objectContaining({
        status: "PENDING",
        nextAttemptAt: now,
      }),
      update: {},
    })
  })

  it("sends a new NF-e and waits for the SEFAZ", async () => {
    db.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow())
    const fetcher = provider({
      "POST /v2/nfe": () => new Response("{}", { status: 202 }),
    })
    const outcome = await processInvoice(invoiceId, {
      now,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(outcome.status).toBe("PROCESSING")
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({ status: "PROCESSING", submittedAt: now }),
    })
  })

  it("stores the XML, the DANFE and the access key once authorized", async () => {
    db.invoice.findUniqueOrThrow.mockResolvedValue(
      invoiceRow({ submittedAt: now })
    )
    db.order.findUnique.mockResolvedValue({
      number: "AB-2026-000302",
      total: { toFixed: () => "1500.00" },
      user: { name: "Cliente Fictício", email: "cliente@atelierbureau.test" },
    })
    const fetcher = provider({
      [`GET /v2/nfe/${invoiceId}`]: () =>
        new Response(
          JSON.stringify({
            status: "autorizado",
            chave_nfe: `NFe${accessKey}`,
            numero: "15",
            serie: "1",
            protocolo: "135260000000001",
            caminho_xml_nota_fiscal: "/arquivos/nfe.xml",
            caminho_danfe: "/arquivos/danfe.pdf",
          }),
          { status: 200 }
        ),
      "GET /arquivos/nfe.xml": () =>
        new Response("<nfeProc>ok</nfeProc>", { status: 200 }),
      "GET /arquivos/danfe.pdf": () =>
        new Response("%PDF-1.4", { status: 200 }),
    })
    const outcome = await processInvoice(invoiceId, {
      now,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(outcome.status).toBe("ISSUED")
    const danfeKey = `invoices/${orderId}/danfe-${accessKey}.pdf`
    expect(saveFile).toHaveBeenCalledWith(danfeKey, Buffer.from("%PDF-1.4"))
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        status: "ISSUED",
        accessKey,
        number: "15",
        xml: "<nfeProc>ok</nfeProc>",
        danfeKey,
        issuedAt: now,
      }),
    })
    expect(db.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "invoice.issue" }),
    })
    // The customer is told about the NF-e in the same transaction (RF53)
    expect(db.emailOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          template: "order.invoiced",
          recipient: "cliente@atelierbureau.test",
        }),
      })
    )
  })

  it("alerts the team and retries when the provider is down", async () => {
    db.invoice.findUniqueOrThrow.mockResolvedValue(invoiceRow())
    db.user.findMany.mockResolvedValue([
      { name: "Financeiro", email: "financeiro@atelierbureau.test" },
    ])
    const fetcher = provider({
      "POST /v2/nfe": () => new Response("{}", { status: 503 }),
    })
    const outcome = await processInvoice(invoiceId, {
      now,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(outcome.status).toBe("FAILED")
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        status: "FAILED",
        attempts: 1,
        nextAttemptAt: new Date(now.getTime() + 60_000),
        alertedAt: now,
      }),
    })
    expect(db.emailOutbox.create).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalled()
  })

  it("waits for a manual reprocess after a SEFAZ rejection", async () => {
    db.invoice.findUniqueOrThrow.mockResolvedValue(
      invoiceRow({ submittedAt: now, alertedAt: now, attempts: 1 })
    )
    const fetcher = provider({
      [`GET /v2/nfe/${invoiceId}`]: () =>
        new Response(
          JSON.stringify({
            status: "erro_autorizacao",
            mensagem_sefaz: "Rejeição: CEP inválido",
          }),
          { status: 200 }
        ),
    })
    const outcome = await processInvoice(invoiceId, {
      now,
      fetcher: fetcher as unknown as typeof fetch,
    })
    expect(outcome.status).toBe("FAILED")
    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        nextAttemptAt: null,
        submittedAt: null,
        lastError: "Rejeição: CEP inválido",
      }),
    })
    // Already alerted, but no automatic retry left: alerts again
    expect(db.user.findMany).toHaveBeenCalled()
  })

  it("does nothing when another run holds the NF-e", async () => {
    db.invoice.updateMany.mockResolvedValue({ count: 0 })
    const outcome = await processInvoice(invoiceId, { now })
    expect(outcome.status).toBe("PROCESSING")
    expect(db.invoice.findUniqueOrThrow).not.toHaveBeenCalled()
  })

  it("backs off and stops the automatic attempts", () => {
    expect(nextRetryAt(1, now)?.getTime()).toBe(now.getTime() + 60_000)
    expect(nextRetryAt(5, now)?.getTime()).toBe(now.getTime() + 240 * 60_000)
    expect(nextRetryAt(6, now)).toBeNull()
  })
})

describe("NF-e failure alert e-mail", () => {
  it("names the order and the failure", () => {
    const email = nfeFailureAlertEmail({
      name: "Financeiro",
      number: "AB-2026-000301",
      error: "CEP inválido",
      automaticRetry: false,
      url: "https://loja.test/admin/nfe",
    })
    expect(email.subject).toBe(
      "Falha na emissão da NF-e do pedido AB-2026-000301"
    )
    expect(email.text).toContain("CEP inválido")
  })
})
