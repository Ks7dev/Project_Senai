import { describe, expect, it } from "vitest"
import { payOrderSchema } from "@/features/payment/order-payment/schema/payment-schema"
import { toProviderPayment } from "@/features/shared/lib/mercadopago/mercadopago"
import {
  paymentExpiresAt,
  toMercadoPagoDate,
} from "@/features/shared/lib/payments/payment-deadlines"

const orderId = "0193a6c2-0000-7000-8000-000000000001"
const deadlines = { pixMinutes: 30, boletoBusinessDays: 3 }

const boleto = {
  payment_method_id: "bolbradesco",
  payer: {
    first_name: "Cliente",
    last_name: "Fictício",
    identification: { type: "CNPJ", number: "12.345.678/0001-95" },
    address: {
      zip_code: "01310-100",
      federal_unit: "sp",
      city: "São Paulo",
      neighborhood: "Bela Vista",
      street_name: "Avenida Paulista",
      street_number: "1000",
    },
  },
}

describe("Pix and boleto deadlines (#55, RN14)", () => {
  it("expires the Pix after the configured minutes", () => {
    const from = new Date("2026-11-11T15:00:00.000Z")
    expect(paymentExpiresAt("PIX", from, deadlines).toISOString()).toBe(
      "2026-11-11T15:30:00.000Z"
    )
    expect(
      paymentExpiresAt("PIX", from, { ...deadlines, pixMinutes: 60 })
    ).toEqual(new Date("2026-11-11T16:00:00.000Z"))
  })

  it("expires the boleto after business days, skipping the weekend", () => {
    // Thursday 12:00 in São Paulo + 3 business days = Tuesday 12:00
    const thursday = new Date("2026-11-12T15:00:00.000Z")
    expect(paymentExpiresAt("BOLETO", thursday, deadlines).toISOString()).toBe(
      "2026-11-17T15:00:00.000Z"
    )
  })

  it("sends the expiration in the Mercado Pago date format", () => {
    expect(toMercadoPagoDate(new Date("2026-11-11T15:30:00.000Z"))).toBe(
      "2026-11-11T15:30:00.000+00:00"
    )
  })
})

describe("Pix and boleto from the Payment Brick (#55, RF29)", () => {
  it("accepts the Pix without card data", () => {
    expect(
      payOrderSchema.safeParse({
        orderId,
        method: "PIX",
        formData: { payment_method_id: "pix", payer: { email: "a@b.test" } },
      }).success
    ).toBe(true)
    expect(
      payOrderSchema.safeParse({
        orderId,
        method: "PIX",
        formData: { payment_method_id: "visa" },
      }).success
    ).toBe(false)
  })

  it("requires the boleto payer name, document and address", () => {
    const parsed = payOrderSchema.safeParse({
      orderId,
      method: "BOLETO",
      formData: boleto,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.formData).toMatchObject({
      payer: {
        identification: { number: "12345678000195" },
        address: { zip_code: "01310100", federal_unit: "SP" },
      },
    })
    const withoutAddress = payOrderSchema.safeParse({
      orderId,
      method: "BOLETO",
      formData: {
        ...boleto,
        payer: { ...boleto.payer, address: undefined },
      },
    })
    expect(withoutAddress.success).toBe(false)
  })

  it("refuses a method the Brick did not send", () => {
    const parsed = payOrderSchema.safeParse({
      orderId,
      method: "INVOICED",
      formData: {},
    })
    expect(parsed.success).toBe(false)
  })

  it("reads the QR Code and the digitable line of the answer", () => {
    const pix = toProviderPayment({
      id: 1,
      status: "pending",
      status_detail: "pending_waiting_transfer",
      transaction_amount: 100,
      payment_method_id: "pix",
      point_of_interaction: {
        transaction_data: { qr_code: "000201-pix", qr_code_base64: "iVBO" },
      },
    })
    expect(pix.pix).toEqual({ qrCode: "000201-pix", qrCodeBase64: "iVBO" })
    expect(pix.boleto).toBeNull()

    const ticket = toProviderPayment({
      id: 2,
      status: "pending",
      transaction_amount: 100,
      payment_method_id: "bolbradesco",
      transaction_details: {
        external_resource_url: "https://boleto.test/2.pdf",
      },
      barcode: { content: "23790000000000000000000000000000000000000000" },
    })
    expect(ticket.boleto).toEqual({
      url: "https://boleto.test/2.pdf",
      digitableLine: "23790000000000000000000000000000000000000000",
    })
  })
})
