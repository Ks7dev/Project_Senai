import { afterEach, describe, expect, it, vi } from "vitest"
import { encryptPersonal } from "@/features/shared/lib/crypto/personal-data-cipher"
import {
  buildPaymentBody,
  payerPhone,
  paymentAdditionalInfo,
  splitPayerName,
  type BoletoBrickData,
  type CardBrickData,
  type PaymentBodyOrder,
} from "@/features/shared/lib/mercadopago/payment-body"

const paymentRowId = "0193a6c2-0000-7000-8000-000000000001"

/** Fictitious order of the sandbox, with encrypted document and phone. */
function fakeOrder(
  overrides: Partial<PaymentBodyOrder> = {}
): PaymentBodyOrder {
  return {
    number: "AB-2026-000001",
    total: 291.8,
    shippingAddress: {
      addressId: "addr-1",
      label: "Casa (teste)",
      recipient: "Destinatário Fictício",
      cep: "70040010",
      street: "Esplanada dos Ministérios",
      number: "10",
      complement: null,
      district: "Zona Cívico-Administrativa",
      city: "Brasília",
      state: "DF",
    },
    user: {
      name: "Cliente  Fictício da Silva",
      email: "cliente.pf@atelierbureau.test",
      document: encryptPersonal("12345678909"),
      phone: encryptPersonal("61987654321"),
      personType: "PF",
    },
    items: [
      {
        skuCode: "CAN-TESTE-001",
        productName: "Caneta Tinteiro Teste — Preta",
        quantity: 2,
        unitPrice: 100,
        sku: {
          product: {
            description: "Caneta tinteiro\nfictícia para testes.",
            category: { slug: "escrita" },
          },
        },
      },
      {
        skuCode: "MES-TESTE-002",
        productName: "Mesa Executiva Teste",
        quantity: 1,
        unitPrice: 45.9,
        sku: {
          product: {
            description: "x".repeat(400),
            category: { slug: "mobiliario" },
          },
        },
      },
    ],
    ...overrides,
  }
}

/** Card data the Payment Brick hands to the action (token only). */
const card: CardBrickData = {
  token: "ff8080814c11e237014c1ff593b57b4d",
  payment_method_id: "master",
  installments: 1,
  issuer_id: "25",
}

const boleto: BoletoBrickData = {
  payment_method_id: "bolbradesco",
  payer: {
    first_name: "Pagador",
    last_name: "Do Boleto",
    identification: { type: "CPF", number: "12345678909" },
    address: {
      zip_code: "01310100",
      federal_unit: "SP",
      city: "São Paulo",
      neighborhood: "Bela Vista",
      street_name: "Avenida Paulista",
      street_number: "1000",
    },
  },
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("payer name (#228)", () => {
  it("splits the first name from the rest", () => {
    expect(splitPayerName("  Cliente  Fictício da Silva ")).toEqual({
      first_name: "Cliente",
      last_name: "Fictício da Silva",
    })
  })

  it("sends only the first name for a single word, nothing for blank", () => {
    expect(splitPayerName("Cliente")).toEqual({ first_name: "Cliente" })
    expect(splitPayerName("   ")).toEqual({})
  })
})

describe("payer phone (#228)", () => {
  it("decrypts the phone and splits area code and number", () => {
    expect(payerPhone(encryptPersonal("61987654321"))).toEqual({
      area_code: "61",
      number: "987654321",
    })
    expect(payerPhone("(11) 3456-7890")).toEqual({
      area_code: "11",
      number: "34567890",
    })
  })

  it("drops the country code 55", () => {
    expect(payerPhone("+55 61 98765-4321")).toEqual({
      area_code: "61",
      number: "987654321",
    })
  })

  it("leaves out a missing or invalid phone", () => {
    expect(payerPhone(null)).toBeNull()
    expect(payerPhone("12345")).toBeNull()
  })
})

describe("quality fields of the payment (#228)", () => {
  it("sends every item with SKU, title, short description and category", () => {
    const info = paymentAdditionalInfo(fakeOrder())
    expect(info.items).toEqual([
      {
        id: "CAN-TESTE-001",
        title: "Caneta Tinteiro Teste — Preta",
        description: "Caneta tinteiro fictícia para testes.",
        category_id: "escrita",
        quantity: 2,
        unit_price: 100,
      },
      {
        id: "MES-TESTE-002",
        title: "Mesa Executiva Teste",
        description: `${"x".repeat(119)}…`,
        category_id: "mobiliario",
        quantity: 1,
        unit_price: 45.9,
      },
    ])
  })

  it("uses the item name when the product has no description", () => {
    const order = fakeOrder()
    order.items[0].sku.product.description = "  "
    expect(paymentAdditionalInfo(order).items[0].description).toBe(
      "Caneta Tinteiro Teste — Preta"
    )
  })

  it("sends the unit price as a number with cents, from the Decimal", () => {
    const order = fakeOrder()
    const toFixed = vi.fn(() => "1234.50")
    order.items[0].unitPrice = { toFixed }
    expect(paymentAdditionalInfo(order).items[0].unit_price).toBe(1234.5)
    expect(toFixed).toHaveBeenCalledWith(2)
  })

  it("sends the payer name, phone and address and the delivery address", () => {
    const info = paymentAdditionalInfo(fakeOrder())
    expect(info.payer).toEqual({
      first_name: "Cliente",
      last_name: "Fictício da Silva",
      phone: { area_code: "61", number: "987654321" },
      address: {
        zip_code: "70040010",
        street_name: "Esplanada dos Ministérios",
        street_number: "10",
      },
    })
    expect(info.shipments).toEqual({
      receiver_address: {
        zip_code: "70040010",
        street_name: "Esplanada dos Ministérios",
        street_number: "10",
        city_name: "Brasília",
        state_name: "DF",
      },
    })
  })

  it("leaves out the phone and the addresses when the order lacks them", () => {
    const info = paymentAdditionalInfo(
      fakeOrder({
        shippingAddress: { cep: "70040010", street: "" },
        user: { ...fakeOrder().user, phone: null },
      })
    )
    expect(info.payer).toEqual({
      first_name: "Cliente",
      last_name: "Fictício da Silva",
    })
    expect(info.shipments).toBeUndefined()
    expect(
      paymentAdditionalInfo(fakeOrder({ shippingAddress: null })).payer
    ).not.toHaveProperty("address")
  })
})

describe("payment body by method (#228, RF36, RN19)", () => {
  it("names the card payer from the account and sends the quality fields", () => {
    const body = buildPaymentBody({
      order: fakeOrder(),
      paymentRowId,
      expiresAt: null,
      method: "CARD",
      formData: card,
    })
    expect(body).toMatchObject({
      transaction_amount: 291.8,
      token: card.token,
      payment_method_id: "master",
      issuer_id: "25",
      three_d_secure_mode: "optional",
      external_reference: paymentRowId,
      payer: {
        email: "cliente.pf@atelierbureau.test",
        first_name: "Cliente",
        last_name: "Fictício da Silva",
        identification: { type: "CPF", number: "12345678909" },
      },
    })
    expect(body.additional_info?.items).toHaveLength(2)
    expect(body.additional_info?.payer.phone).toEqual({
      area_code: "61",
      number: "987654321",
    })
    expect(body.additional_info?.shipments?.receiver_address.zip_code).toBe(
      "70040010"
    )
  })

  it("carries the card only as the token, never card data (RN19)", () => {
    const body = buildPaymentBody({
      order: fakeOrder(),
      paymentRowId,
      expiresAt: null,
      method: "CARD",
      formData: card,
    })
    const json = JSON.stringify(body)
    expect(json.split(card.token)).toHaveLength(2)
    expect(json).not.toMatch(
      /card_?number|security_?code|cvv|cvc|expiration_?(month|year)|cardholder/i
    )
    // No 13 to 19 digit sequence (a card number) anywhere in the body
    expect(json).not.toMatch(/\d{13,19}/)
    // The encrypted values never leak; only the plain document is sent
    expect(json).not.toContain("v1.")
  })

  it("names the Pix payer from the account", () => {
    const body = buildPaymentBody({
      order: fakeOrder(),
      paymentRowId,
      expiresAt: new Date("2026-11-11T15:30:00.000Z"),
      method: "PIX",
    })
    expect(body).toMatchObject({
      payment_method_id: "pix",
      date_of_expiration: "2026-11-11T15:30:00.000+00:00",
      payer: {
        first_name: "Cliente",
        last_name: "Fictício da Silva",
        identification: { type: "CPF", number: "12345678909" },
      },
      additional_info: { payer: { first_name: "Cliente" } },
    })
    expect(body).not.toHaveProperty("token")
  })

  it("keeps the boleto payer typed in the Brick and adds the quality fields", () => {
    const body = buildPaymentBody({
      order: fakeOrder({ user: { ...fakeOrder().user, personType: "PJ" } }),
      paymentRowId,
      expiresAt: new Date("2026-11-17T15:00:00.000Z"),
      method: "BOLETO",
      formData: boleto,
    })
    expect(body.payer).toEqual({
      email: "cliente.pf@atelierbureau.test",
      first_name: "Pagador",
      last_name: "Do Boleto",
      identification: boleto.payer.identification,
      address: boleto.payer.address,
    })
    expect(body.additional_info?.items.map((item) => item.id)).toEqual([
      "CAN-TESTE-001",
      "MES-TESTE-002",
    ])
    expect(body.additional_info?.payer.last_name).toBe("Fictício da Silva")
  })

  it("sends the CNPJ of a PJ customer and the notification URL", () => {
    vi.stubEnv(
      "MERCADOPAGO_NOTIFICATION_URL",
      "https://tunel.teste/api/webhooks/mercadopago"
    )
    const body = buildPaymentBody({
      order: fakeOrder({
        user: {
          ...fakeOrder().user,
          personType: "PJ",
          document: encryptPersonal("12345678000195"),
        },
      }),
      paymentRowId,
      expiresAt: null,
      method: "CARD",
      formData: { ...card, issuer_id: null },
    })
    expect(body.notification_url).toBe(
      "https://tunel.teste/api/webhooks/mercadopago"
    )
    expect(body.payer.identification).toEqual({
      type: "CNPJ",
      number: "12345678000195",
    })
    expect(body).not.toHaveProperty("issuer_id")
  })
})
