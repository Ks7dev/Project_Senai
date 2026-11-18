import "server-only"
import { z } from "zod"
import { decryptPersonal } from "@/features/shared/lib/crypto/personal-data-cipher"
import {
  mercadoPagoNotificationUrl,
  mercadoPagoPayerEmail,
  type CreatePaymentBody,
  type PaymentAdditionalInfo,
} from "@/features/shared/lib/mercadopago/mercadopago"
import { toMercadoPagoDate } from "@/features/shared/lib/payments/payment-deadlines"

/** Money as Prisma returns it (Decimal); a number also fits. */
type Money = { toFixed(digits: number): string }

/** Most characters of an item description sent to Mercado Pago. */
const ITEM_DESCRIPTION_MAX = 120

/** Order data the `/v1/payments` body needs. */
export type PaymentBodyOrder = {
  /** Readable order number. */
  number: string
  /** Order total. */
  total: Money
  /** Address snapshot taken at checkout (unknown JSON from the order). */
  shippingAddress: unknown
  /** Buyer; document and phone are still encrypted (RNF03). */
  user: {
    name: string
    email: string
    document: string
    phone: string | null
    personType: string
  }
  /** Ordered items, with the product category. */
  items: Array<{
    skuCode: string
    productName: string
    quantity: number
    unitPrice: Money
    sku: {
      product: { description: string; category: { slug: string } }
    }
  }>
}

/** Brick data of a card payment: only the token, never the card (RN19). */
export type CardBrickData = {
  token: string
  payment_method_id: string
  installments: number
  issuer_id?: string | null
  payer?: { identification?: { type: string; number: string } }
}

/** Brick data of a boleto payment: the payer typed in the Brick. */
export type BoletoBrickData = {
  payment_method_id: string
  payer: {
    first_name: string
    last_name: string
    identification: { type: string; number: string }
    address: Record<string, string | undefined>
  }
}

/** Brick data of the chosen method. */
export type PaymentMethodData =
  | { method: "CARD"; formData: CardBrickData }
  | { method: "PIX"; formData?: unknown }
  | { method: "BOLETO"; formData: BoletoBrickData }

/** Input of {@link buildPaymentBody}. */
export type PaymentBodyInput = {
  /** The order being paid. */
  order: PaymentBodyOrder
  /** Our payment row id (external reference). */
  paymentRowId: string
  /** Pix and boleto expiration (RN14), or null for the card. */
  expiresAt: Date | null
} & PaymentMethodData

const shippingAddressSchema = z.object({
  cep: z.string().optional(),
  street: z.string().optional(),
  number: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
})

/**
 * Splits a full name into the first name and the rest, as Mercado Pago
 * asks for `first_name` and `last_name`.
 *
 * @param fullName - Name of the user.
 * @returns First and last name; the last name is omitted for a single
 * word, and both for an empty name.
 */
export function splitPayerName(fullName: string): {
  first_name?: string
  last_name?: string
} {
  const [first, ...rest] = fullName.trim().split(/\s+/).filter(Boolean)
  if (!first) return {}
  return rest.length > 0
    ? { first_name: first, last_name: rest.join(" ") }
    : { first_name: first }
}

/**
 * Brazilian phone in the Mercado Pago format: area code and number,
 * digits only. A leading country code 55 is dropped.
 *
 * @param stored - Phone as stored (encrypted or plain), or null.
 * @returns `{ area_code, number }`, or null when it is not a valid
 * landline or mobile number.
 */
export function payerPhone(
  stored: string | null
): { area_code: string; number: string } | null {
  const plain = decryptPersonal(stored)
  if (!plain) return null
  let digits = plain.replace(/\D/g, "")
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55"))
    digits = digits.slice(2)
  if (digits.length !== 10 && digits.length !== 11) return null
  return { area_code: digits.slice(0, 2), number: digits.slice(2) }
}

/**
 * Short item description: the product description on one line, cut at
 * the limit, or the item name when the product has none.
 *
 * @param description - Product description.
 * @param fallback - Item name.
 * @returns The description.
 */
function shortDescription(description: string, fallback: string): string {
  const line = description.replace(/\s+/g, " ").trim()
  if (!line) return fallback
  return line.length > ITEM_DESCRIPTION_MAX
    ? `${line.slice(0, ITEM_DESCRIPTION_MAX - 1).trimEnd()}…`
    : line
}

/**
 * Quality fields of the payment (#228): the items, the buyer (name,
 * phone and address) and the delivery address, which Mercado Pago uses
 * in its fraud analysis to approve more payments. They carry personal
 * data and are never logged.
 *
 * @param order - The order.
 * @returns The `additional_info` object.
 */
export function paymentAdditionalInfo(
  order: PaymentBodyOrder
): PaymentAdditionalInfo {
  const address = shippingAddressSchema.safeParse(order.shippingAddress)
  const cep = address.success ? address.data.cep?.replace(/\D/g, "") : ""
  const street = address.success ? address.data.street?.trim() : ""
  const number = address.success ? address.data.number?.trim() : ""
  const hasAddress = Boolean(cep && street && number)
  const city = address.success ? address.data.city?.trim() : ""
  const state = address.success ? address.data.state?.trim() : ""
  const phone = payerPhone(order.user.phone)
  return {
    items: order.items.map((item) => ({
      id: item.skuCode,
      title: item.productName,
      description: shortDescription(
        item.sku.product.description,
        item.productName
      ),
      category_id: item.sku.product.category.slug,
      quantity: item.quantity,
      unit_price: Number(item.unitPrice.toFixed(2)),
    })),
    payer: {
      ...splitPayerName(order.user.name),
      ...(phone ? { phone } : {}),
      ...(hasAddress
        ? {
            address: {
              zip_code: cep!,
              street_name: street!,
              street_number: number!,
            },
          }
        : {}),
    },
    ...(hasAddress
      ? {
          shipments: {
            receiver_address: {
              zip_code: cep!,
              street_name: street!,
              street_number: number!,
              ...(city ? { city_name: city } : {}),
              ...(state ? { state_name: state } : {}),
            },
          },
        }
      : {}),
  }
}

/**
 * Builds the `/v1/payments` body (RF36). The amount comes from the
 * order, never from the browser. A card is only the Brick token (RF35,
 * RN19), with 3DS when the issuer asks (RF37); Pix and boleto carry the
 * configured expiration (RN14). Every method sends the quality fields
 * of Mercado Pago (#228); the card and the Pix name the payer from the
 * account, the boleto keeps the name typed in the Brick.
 *
 * @param input - Order, payment row, expiration and Brick data.
 * @returns The body.
 */
export function buildPaymentBody(input: PaymentBodyInput): CreatePaymentBody {
  const { order } = input
  const notificationUrl = mercadoPagoNotificationUrl()
  const document = {
    type: order.user.personType === "PJ" ? "CNPJ" : "CPF",
    number: decryptPersonal(order.user.document),
  }
  const email = mercadoPagoPayerEmail(order.user.email)
  const common = {
    transaction_amount: Number(order.total.toFixed(2)),
    description: `Pedido ${order.number} — Atelier Bureau`,
    external_reference: input.paymentRowId,
    ...(notificationUrl ? { notification_url: notificationUrl } : {}),
    metadata: { order_number: order.number },
    ...(input.expiresAt
      ? { date_of_expiration: toMercadoPagoDate(input.expiresAt) }
      : {}),
    additional_info: paymentAdditionalInfo(order),
  }
  if (input.method === "CARD") {
    const { formData } = input
    return {
      ...common,
      payment_method_id: formData.payment_method_id,
      token: formData.token,
      installments: formData.installments,
      ...(formData.issuer_id ? { issuer_id: formData.issuer_id } : {}),
      three_d_secure_mode: "optional",
      statement_descriptor: "ATELIERBUREAU",
      payer: {
        email,
        ...splitPayerName(order.user.name),
        identification: formData.payer?.identification ?? document,
      },
    }
  }
  if (input.method === "PIX") {
    return {
      ...common,
      payment_method_id: "pix",
      payer: {
        email,
        ...splitPayerName(order.user.name),
        identification: document,
      },
    }
  }
  const { payer } = input.formData
  return {
    ...common,
    payment_method_id: input.formData.payment_method_id,
    payer: {
      email,
      first_name: payer.first_name,
      last_name: payer.last_name,
      identification: payer.identification,
      address: payer.address,
    },
  }
}
