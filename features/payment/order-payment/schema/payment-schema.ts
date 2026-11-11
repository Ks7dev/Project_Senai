import { z } from "zod"

/**
 * Keys that would carry raw card data. The Brick only sends the token
 * (RF35); a request with any of these keys is refused before anything
 * else, so card data never reaches the backend logic or the database
 * (RN19).
 */
const CARD_DATA_KEY =
  /card_?number|security_?code|cvv|cvc|expiration_?(month|year|date)|card_?holder/i

/**
 * Whether a value carries raw card data in any key, at any depth.
 *
 * @param value - Request payload.
 * @param depth - Current depth, to stop on deep objects.
 * @returns True when a card data key is present.
 */
export function containsCardData(value: unknown, depth = 0): boolean {
  if (depth > 5 || !value || typeof value !== "object") return false
  if (Array.isArray(value)) {
    return value.some((item) => containsCardData(item, depth + 1))
  }
  return Object.entries(value).some(
    ([key, item]) =>
      CARD_DATA_KEY.test(key) || containsCardData(item, depth + 1)
  )
}

const digits = (value: string) => value.replace(/\D/g, "")

/** Payer document sent by the Brick. */
const identificationSchema = z.object({
  type: z.enum(["CPF", "CNPJ"], "Documento do pagador inválido."),
  number: z
    .string("Documento do pagador inválido.")
    .transform(digits)
    .refine(
      (value) => value.length === 11 || value.length === 14,
      "Documento do pagador inválido."
    ),
})

/** Card form data of the Payment Brick: only the token, never the card. */
export const cardFormSchema = z.object({
  token: z
    .string("Pagamento inválido.")
    .trim()
    .regex(/^[A-Za-z0-9_-]{8,255}$/, "Pagamento inválido."),
  payment_method_id: z
    .string("Pagamento inválido.")
    .regex(/^[a-z_]{2,40}$/, "Pagamento inválido."),
  issuer_id: z
    .union([z.string(), z.number()])
    .transform(String)
    .pipe(z.string().regex(/^\d{1,20}$/, "Pagamento inválido."))
    .nullish(),
  installments: z.coerce
    .number("Número de parcelas inválido.")
    .int("Número de parcelas inválido.")
    .min(1, "Número de parcelas inválido.")
    .max(24, "Número de parcelas inválido."),
  payer: z
    .object({
      email: z.string().optional(),
      identification: identificationSchema.optional(),
    })
    .optional(),
})

/** Card form data of the Payment Brick. */
export type CardFormData = z.output<typeof cardFormSchema>

/** Pix form data of the Payment Brick (RF29). */
export const pixFormSchema = z.object({
  payment_method_id: z.literal("pix", "Pagamento inválido."),
  payer: z.object({ email: z.string().optional() }).optional(),
})

const text = (max: number, message: string) =>
  z.string(message).trim().min(1, message).max(max, message)

/** Boleto form data of the Payment Brick: payer name, document and address (RF29). */
export const boletoFormSchema = z.object({
  payment_method_id: z
    .string("Pagamento inválido.")
    .regex(/^bol[a-z_]{0,30}$/, "Pagamento inválido."),
  payer: z.object({
    email: z.string().optional(),
    first_name: text(80, "Informe o nome do pagador."),
    last_name: text(80, "Informe o sobrenome do pagador."),
    identification: identificationSchema,
    address: z.object({
      zip_code: z
        .string("CEP do pagador inválido.")
        .transform(digits)
        .refine((value) => value.length === 8, "CEP do pagador inválido."),
      federal_unit: z
        .string("UF do pagador inválida.")
        .trim()
        .regex(/^[A-Za-z]{2}$/, "UF do pagador inválida.")
        .transform((value) => value.toUpperCase()),
      city: text(120, "Informe a cidade do pagador."),
      neighborhood: text(120, "Informe o bairro do pagador."),
      street_name: text(191, "Informe a rua do pagador."),
      street_number: text(20, "Informe o número do endereço do pagador."),
      complement: z.string().trim().max(120).optional(),
    }),
  }),
})

/** Pix form data of the Payment Brick. */
export type PixFormData = z.output<typeof pixFormSchema>

/** Boleto form data of the Payment Brick. */
export type BoletoFormData = z.output<typeof boletoFormSchema>

/** Order payment fields by method (RF28, RF29, RF36). */
const payOrderFields = z.discriminatedUnion(
  "method",
  [
    z.object({
      orderId: z.uuid("Pedido inválido."),
      method: z.literal("CARD"),
      formData: cardFormSchema,
    }),
    z.object({
      orderId: z.uuid("Pedido inválido."),
      method: z.literal("PIX"),
      formData: pixFormSchema,
    }),
    z.object({
      orderId: z.uuid("Pedido inválido."),
      method: z.literal("BOLETO"),
      formData: boletoFormSchema,
    }),
  ],
  "Forma de pagamento inválida."
)

/**
 * Payment of an order through the Payment Brick (RF28, RF36). The raw
 * payload is checked for card data before the fields are read, so a
 * card number is refused instead of silently dropped (RN19).
 */
export const payOrderSchema = z
  .unknown()
  .refine((value) => !containsCardData(value), "Pagamento inválido.")
  .pipe(payOrderFields)

/** Values of the order payment. */
export type PayOrderInput = z.input<typeof payOrderFields>

/** Order whose payment page is open. */
export const orderPaymentSchema = z.object({
  orderId: z.uuid("Pedido inválido."),
})
