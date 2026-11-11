import { describe, expect, it } from "vitest"
import { addBusinessDays } from "@/features/shared/lib/shipping/business-days"
import { manualQuoteResponseMessage } from "@/features/shared/lib/shipping/shipping-messages"
import { answerManualQuoteSchema } from "@/features/shipping/manual-quotes/schema/manual-quote-schema"
import { settings } from "@/prisma/seed-data"

describe("return deadline of the manual quote (#44)", () => {
  it("skips the weekend", () => {
    // Friday 12:00 in São Paulo
    const friday = new Date("2026-11-13T15:00:00.000Z")
    expect(addBusinessDays(friday, 1).toISOString()).toBe(
      "2026-11-16T15:00:00.000Z"
    )
    expect(addBusinessDays(friday, 2).toISOString()).toBe(
      "2026-11-17T15:00:00.000Z"
    )
  })

  it("uses the São Paulo calendar late at night", () => {
    // Friday 22:30 in São Paulo is already Saturday in UTC
    const lateFriday = new Date("2026-11-14T01:30:00.000Z")
    expect(addBusinessDays(lateFriday, 1).toISOString()).toBe(
      "2026-11-17T01:30:00.000Z"
    )
  })

  it("keeps the date for zero days", () => {
    const date = new Date("2026-11-11T12:00:00.000Z")
    expect(addBusinessDays(date, 0)).toEqual(date)
  })

  it("comes from the settings table", () => {
    expect(
      settings.find(
        (item) => item.key === "shipping.manual_quote_response_business_days"
      )?.value
    ).toBe(2)
  })

  it("tells the customer the return time", () => {
    expect(manualQuoteResponseMessage(2)).toBe(
      "Nossa equipe comercial retorna com o valor e o prazo do frete em até 2 dias úteis."
    )
    expect(manualQuoteResponseMessage(1)).toMatch(/até 1 dia útil\.$/)
  })
})

describe("manual quote answer (#44)", () => {
  const valid = {
    orderId: "0195f1d2-7c3a-7b1e-9a4b-2f6d8e0c1a2b",
    method: "CARRIER",
    carrier: "Transportadora Fictícia",
    service: "Rodoviário",
    price: "1250,5",
    deliveryDays: "7",
  }

  it("normalizes the price and the delivery time", () => {
    expect(answerManualQuoteSchema.parse(valid)).toMatchObject({
      price: "1250.5",
      deliveryDays: 7,
      note: "",
    })
    expect(
      answerManualQuoteSchema.parse({ ...valid, deliveryDays: "" }).deliveryDays
    ).toBeNull()
  })

  it("refuses the manual method, invalid prices and times", () => {
    expect(
      answerManualQuoteSchema.safeParse({ ...valid, method: "MANUAL_QUOTE" })
        .success
    ).toBe(false)
    expect(
      answerManualQuoteSchema.safeParse({ ...valid, price: "-10" }).success
    ).toBe(false)
    expect(
      answerManualQuoteSchema.safeParse({ ...valid, deliveryDays: "0" }).error
        ?.issues[0]?.message
    ).toBe("O prazo deve ficar entre 1 e 365 dias úteis.")
  })
})
