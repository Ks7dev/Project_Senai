import { describe, expect, it } from "vitest"
import { placeOrderSchema } from "@/features/payment/checkout/schema/checkout-schema"
import {
  containsCardData,
  payOrderSchema,
} from "@/features/payment/order-payment/schema/payment-schema"
import { addressLine } from "@/features/shared/lib/addresses/address-snapshot"

const orderId = "0193a6c2-0000-7000-8000-000000000001"
const addressId = "0193a6c2-0000-7000-8000-000000000002"

const brickCard = {
  token: "ff8080814c11e237014c1ff593b57b4d",
  issuer_id: "25",
  payment_method_id: "visa",
  transaction_amount: 589.9,
  installments: 1,
  payer: {
    email: "comprador@teste.test",
    identification: { type: "CPF", number: "123.456.789-09" },
  },
}

describe("card data never reaches the backend (#54, RN19)", () => {
  it("accepts the Brick token data", () => {
    const parsed = payOrderSchema.safeParse({
      orderId,
      method: "CARD",
      formData: brickCard,
    })
    expect(parsed.success).toBe(true)
    expect(parsed.data?.method).toBe("CARD")
    expect(parsed.data?.formData).toMatchObject({
      payer: { identification: { number: "12345678909" } },
    })
    // The amount of the browser is ignored: the server uses the order's
    expect(parsed.data?.formData).not.toHaveProperty("transaction_amount")
  })

  it("refuses any raw card field", () => {
    for (const field of [
      { card_number: "4235647728025682" },
      { cardNumber: "4235647728025682" },
      { security_code: "123" },
      { cvv: "123" },
      { expiration_month: "11" },
      { cardholder: { name: "APRO" } },
    ]) {
      expect(containsCardData({ formData: { ...brickCard, ...field } })).toBe(
        true
      )
      expect(
        payOrderSchema.safeParse({
          orderId,
          method: "CARD",
          formData: { ...brickCard, ...field },
        }).success
      ).toBe(false)
    }
  })

  it("requires the token", () => {
    const { token: _token, ...withoutToken } = brickCard
    void _token
    expect(
      payOrderSchema.safeParse({
        orderId,
        method: "CARD",
        formData: withoutToken,
      }).success
    ).toBe(false)
  })
})

describe("checkout schema (#54)", () => {
  const valid = {
    addressId,
    option: { method: "CORREIOS_PAC", carrier: "Correios", service: "PAC" },
    expectedShippingPrice: "45.90",
    expectedTotal: "635.80",
    paymentMethod: "CARD",
  }

  it("requires the address, the amounts seen and the method", () => {
    expect(placeOrderSchema.safeParse(valid).success).toBe(true)
    expect(
      placeOrderSchema.safeParse({
        ...valid,
        option: null,
        expectedShippingPrice: "0.00",
      }).success
    ).toBe(true)
    expect(
      placeOrderSchema.safeParse({ ...valid, expectedTotal: "635,8" }).success
    ).toBe(false)
    // The invoiced purchase is a checkout method since #60; the action
    // offers it only to approved accounts with credit (RN03, RN10)
    expect(
      placeOrderSchema.safeParse({ ...valid, paymentMethod: "INVOICED" })
        .success
    ).toBe(true)
    const noMethod = placeOrderSchema.safeParse({
      ...valid,
      paymentMethod: "FINANCING",
    })
    expect(noMethod.success).toBe(false)
    expect(noMethod.error?.issues[0]?.message).toBe(
      "Escolha a forma de pagamento."
    )
  })

  it("describes the delivery address in one line", () => {
    expect(
      addressLine({
        cep: "01310100",
        street: "Avenida Paulista",
        number: "1000",
        complement: "Sala 2",
        district: "Bela Vista",
        city: "São Paulo",
        state: "SP",
      })
    ).toBe(
      "Avenida Paulista, 1000 – Sala 2 · Bela Vista · São Paulo/SP · CEP 01310-100"
    )
    expect(addressLine(null)).toBe("—")
  })
})
