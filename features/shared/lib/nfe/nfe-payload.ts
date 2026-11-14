import { z } from "zod"
import { fromCents, toCents } from "@/features/shared/lib/shipping/strategies"

/**
 * Name SEFAZ requires for the recipient of an NF-e issued in
 * homologation. It also keeps the customer name out of the test NF-e.
 */
export const HOMOLOGATION_RECIPIENT =
  "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"

/** Issuer of the NF-e (setting `invoice.issuer`). */
export const nfeIssuerSchema = z.object({
  cnpj: z.string().regex(/^\d{14}$/),
  name: z.string().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
})

/** Issuer settings. */
export type NfeIssuer = z.infer<typeof nfeIssuerSchema>

/** Fiscal defaults of the NF-e (setting `invoice.nfe_defaults`). */
export const nfeDefaultsSchema = z.object({
  operationNature: z.string().min(1).max(60),
  ncm: z.string().regex(/^\d{8}$/),
  cfopSameState: z.string().regex(/^\d{4}$/),
  cfopOtherState: z.string().regex(/^\d{4}$/),
  icmsSituation: z.string().regex(/^\d{2,3}$/),
  pisCofinsSituation: z.string().regex(/^\d{2}$/),
})

/** Fiscal defaults. */
export type NfeDefaults = z.infer<typeof nfeDefaultsSchema>

/** Delivery address copied to the order. */
const addressSchema = z.object({
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullish(),
  district: z.string().min(1),
  city: z.string().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
  cep: z.string().regex(/^\d{8}$/),
})

/** Order data the NF-e needs. */
export type NfeOrder = {
  /** Readable order number. */
  number: string
  /** CPF (11 digits) or CNPJ (14 digits) of the recipient. */
  document: string
  /** Delivery address snapshot (unknown JSON from the order). */
  shippingAddress: unknown
  /** Shipping total, decimal string. */
  shippingTotal: string
  /** Discount, decimal string. */
  discount: string
  /** Services total (engraving, packaging, assembly), decimal string. */
  servicesTotal: string
  /** Goods. */
  items: Array<{
    skuCode: string
    productName: string
    quantity: number
    unitPrice: string
  }>
}

/** Why an NF-e could not be built from the order. */
export class NfePayloadError extends Error {
  /**
   * Creates the error.
   *
   * @param publicMessage - Message for the back office, in Portuguese.
   */
  constructor(public readonly publicMessage: string) {
    super(publicMessage)
    this.name = "NfePayloadError"
  }
}

/**
 * Splits an amount among the items in proportion to their gross value;
 * the cents left go to the last item, so the parts add up exactly.
 *
 * @param totalCents - Amount to split, in cents.
 * @param weights - Gross value of each item, in cents.
 * @returns The part of each item, in cents.
 */
export function allocateCents(totalCents: number, weights: number[]): number[] {
  const sum = weights.reduce((total, weight) => total + weight, 0)
  if (totalCents <= 0 || sum <= 0) return weights.map(() => 0)
  const parts = weights.map((weight) => Math.floor((totalCents * weight) / sum))
  const rest = totalCents - parts.reduce((total, part) => total + part, 0)
  parts[parts.length - 1] += rest
  return parts
}

/**
 * Builds the NF-e of an order in the provider format (Focus NFe v2):
 * issuer, recipient (named as homologation, RF13), delivery address,
 * goods with NCM, CFOP (same or other state) and the Simples Nacional
 * tax situations, and the freight and discount split by item. Services
 * (engraving, packaging, assembly) are not goods: they are noted in the
 * additional information and need their own service invoice.
 *
 * @param order - Order data.
 * @param issuer - Issuer settings.
 * @param defaults - Fiscal defaults.
 * @param now - Issue date.
 * @returns The payload.
 * @throws NfePayloadError when the order lacks data.
 */
export function buildNfePayload(
  order: NfeOrder,
  issuer: NfeIssuer,
  defaults: NfeDefaults,
  now: Date
): Record<string, unknown> {
  const address = addressSchema.safeParse(order.shippingAddress)
  if (!address.success) {
    throw new NfePayloadError(
      "O endereço de entrega do pedido está incompleto."
    )
  }
  const document = order.document.replace(/\D/g, "")
  if (document.length !== 11 && document.length !== 14) {
    throw new NfePayloadError("O CPF ou CNPJ do cliente é inválido.")
  }
  if (order.items.length === 0) {
    throw new NfePayloadError("O pedido não tem itens para a NF-e.")
  }

  const sameState = address.data.state === issuer.state
  const cfop = sameState ? defaults.cfopSameState : defaults.cfopOtherState
  const gross = order.items.map(
    (item) => toCents(item.unitPrice) * item.quantity
  )
  const freight = allocateCents(toCents(order.shippingTotal), gross)
  const discount = allocateCents(toCents(order.discount), gross)
  const notes = [
    `Pedido ${order.number}.`,
    "Documento emitido em ambiente de homologação, sem valor fiscal.",
    toCents(order.servicesTotal) > 0
      ? `Serviços (gravação, embalagem e montagem) de R$ ${fromCents(toCents(order.servicesTotal)).replace(".", ",")} cobrados à parte, fora desta NF-e.`
      : null,
  ].filter(Boolean)

  return {
    natureza_operacao: defaults.operationNature,
    data_emissao: now.toISOString(),
    tipo_documento: 1,
    finalidade_emissao: 1,
    local_destino: sameState ? 1 : 2,
    consumidor_final: 1,
    presenca_comprador: 2,
    modalidade_frete: 0,
    cnpj_emitente: issuer.cnpj,
    nome_destinatario: HOMOLOGATION_RECIPIENT,
    ...(document.length === 11
      ? { cpf_destinatario: document }
      : { cnpj_destinatario: document }),
    indicador_inscricao_estadual_destinatario: 9,
    logradouro_destinatario: address.data.street.slice(0, 60),
    numero_destinatario: address.data.number.slice(0, 60),
    ...(address.data.complement
      ? { complemento_destinatario: address.data.complement.slice(0, 60) }
      : {}),
    bairro_destinatario: address.data.district.slice(0, 60),
    municipio_destinatario: address.data.city.slice(0, 60),
    uf_destinatario: address.data.state,
    cep_destinatario: address.data.cep,
    pais_destinatario: "Brasil",
    informacoes_adicionais_contribuinte: notes.join(" "),
    items: order.items.map((item, index) => ({
      numero_item: index + 1,
      codigo_produto: item.skuCode.slice(0, 60),
      descricao: item.productName.slice(0, 120),
      cfop,
      codigo_ncm: defaults.ncm,
      unidade_comercial: "UN",
      quantidade_comercial: item.quantity,
      valor_unitario_comercial: Number(item.unitPrice).toFixed(2),
      valor_bruto: fromCents(gross[index]),
      unidade_tributavel: "UN",
      quantidade_tributavel: item.quantity,
      valor_unitario_tributavel: Number(item.unitPrice).toFixed(2),
      ...(freight[index] > 0 ? { valor_frete: fromCents(freight[index]) } : {}),
      ...(discount[index] > 0
        ? { valor_desconto: fromCents(discount[index]) }
        : {}),
      inclui_no_total: 1,
      icms_origem: 0,
      icms_situacao_tributaria: defaults.icmsSituation,
      pis_situacao_tributaria: defaults.pisCofinsSituation,
      cofins_situacao_tributaria: defaults.pisCofinsSituation,
    })),
  }
}
