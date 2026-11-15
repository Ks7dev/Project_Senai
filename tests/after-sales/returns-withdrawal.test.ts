import { describe, expect, it } from "vitest"
import { supportTicketUpdateSchema } from "@/features/after-sales/support-desk/schema/support-desk-schema"
import {
  openTicketSchema,
  ticketFormSourceSchema,
  WITHDRAWAL_DEFAULT_SUBJECT,
} from "@/features/after-sales/support-tickets/schema/support-ticket-schema"
import {
  allowedReturnOutcomes,
  canDenyTicket,
  checkReturnEligibility,
  checkReturnResolution,
  isPersonalizedItem,
  NOT_DELIVERED_MESSAGE,
  PJ_PERSONALIZED_BLOCKED_MESSAGE,
  purchasePersonType,
  RETURN_OUTCOME_REQUIRED_MESSAGE,
  WITHDRAWAL_CANNOT_BE_DENIED_MESSAGE,
  WITHDRAWAL_EXPIRED_MESSAGE,
  WITHDRAWAL_PF_ONLY_MESSAGE,
  withdrawalDeadline,
  withdrawalExpiredMessage,
  effectiveWithdrawalDays,
} from "@/features/shared/lib/support/return-policy"

const orderId = "019a7b1e-0000-7000-8000-000000000001"
const orderItemId = "019a7b1e-0000-7000-8000-000000000002"
const ticketId = "019a7b1e-0000-7000-8000-000000000003"

/** Received on 10/11/2026 at 15:00 in São Paulo. */
const deliveredAt = new Date("2026-11-10T18:00:00.000Z")

describe("withdrawal deadline (#71, RN22)", () => {
  it("ends at the end of the 7th calendar day after the receipt", () => {
    expect(withdrawalDeadline(deliveredAt).toISOString()).toBe(
      "2026-11-18T03:00:00.000Z"
    )
  })

  it("counts the São Paulo calendar day of a late-night delivery", () => {
    // 23:30 on 10/11 in São Paulo is already 11/11 in UTC.
    expect(
      withdrawalDeadline(new Date("2026-11-11T02:30:00.000Z")).toISOString()
    ).toBe("2026-11-18T03:00:00.000Z")
  })
})

describe("PF withdrawal within 7 days (#71, RN22)", () => {
  const base = {
    kind: "WITHDRAWAL" as const,
    reason: null,
    personType: "PF" as const,
    personalized: false,
    deliveredAt,
  }

  it("accepts the withdrawal on the 7th day", () => {
    expect(
      checkReturnEligibility({
        ...base,
        now: new Date("2026-11-18T02:59:00.000Z"),
      })
    ).toEqual({ allowed: true, legalReview: false })
  })

  it("refuses the withdrawal after the 7th day", () => {
    expect(
      checkReturnEligibility({
        ...base,
        now: new Date("2026-11-18T03:00:00.000Z"),
      })
    ).toEqual({ allowed: false, message: WITHDRAWAL_EXPIRED_MESSAGE })
  })

  it("follows the configured days, never below the legal 7 days", () => {
    const now = new Date("2026-11-20T12:00:00.000Z")
    expect(
      checkReturnEligibility({ ...base, now, withdrawalDays: 10 })
    ).toEqual({ allowed: true, legalReview: false })
    expect(checkReturnEligibility({ ...base, now, withdrawalDays: 3 })).toEqual(
      { allowed: false, message: withdrawalExpiredMessage(7) }
    )
    expect(withdrawalDeadline(deliveredAt, 10).toISOString()).toBe(
      "2026-11-21T03:00:00.000Z"
    )
    expect(effectiveWithdrawalDays(3)).toBe(7)
    expect(effectiveWithdrawalDays(Number.NaN)).toBe(7)
    expect(effectiveWithdrawalDays(10)).toBe(10)
  })

  it("is only for PF purchases", () => {
    expect(
      checkReturnEligibility({
        ...base,
        personType: "PJ",
        now: new Date("2026-11-12T12:00:00.000Z"),
      })
    ).toEqual({ allowed: false, message: WITHDRAWAL_PF_ONLY_MESSAGE })
  })

  it("flags a personalized PF item for the legal opinion", () => {
    expect(
      checkReturnEligibility({
        ...base,
        personalized: true,
        now: new Date("2026-11-12T12:00:00.000Z"),
      })
    ).toEqual({ allowed: true, legalReview: true })
  })

  it("needs the receipt first", () => {
    expect(
      checkReturnEligibility({
        ...base,
        deliveredAt: null,
        now: new Date("2026-11-12T12:00:00.000Z"),
      })
    ).toEqual({ allowed: false, message: NOT_DELIVERED_MESSAGE })
  })
})

describe("PJ personalized items (#71, RN12)", () => {
  const base = {
    kind: "RETURN" as const,
    personType: "PJ" as const,
    personalized: true,
    deliveredAt,
    now: new Date("2026-12-20T12:00:00.000Z"),
  }

  it("blocks the exchange or return unless it is a defect", () => {
    expect(
      checkReturnEligibility({ ...base, reason: "NOT_AS_EXPECTED" })
    ).toEqual({ allowed: false, message: PJ_PERSONALIZED_BLOCKED_MESSAGE })
    expect(
      checkReturnEligibility({
        ...base,
        kind: "EXCHANGE",
        reason: "WRONG_ITEM",
      })
    ).toEqual({ allowed: false, message: PJ_PERSONALIZED_BLOCKED_MESSAGE })
  })

  it("accepts a defect for the technical evaluation", () => {
    expect(checkReturnEligibility({ ...base, reason: "DEFECT" })).toEqual({
      allowed: true,
      legalReview: false,
    })
  })

  it("accepts PJ items that are not personalized for evaluation", () => {
    expect(
      checkReturnEligibility({
        ...base,
        personalized: false,
        reason: "NOT_AS_EXPECTED",
      })
    ).toEqual({ allowed: true, legalReview: false })
  })
})

describe("purchase data (#71)", () => {
  it("treats corporate orders and PJ buyers as PJ", () => {
    expect(
      purchasePersonType({ organizationId: null, buyerPersonType: "PF" })
    ).toBe("PF")
    expect(
      purchasePersonType({ organizationId: orderId, buyerPersonType: "PF" })
    ).toBe("PJ")
    expect(
      purchasePersonType({ organizationId: null, buyerPersonType: "PJ" })
    ).toBe("PJ")
  })

  it("reads the personalization of the order item", () => {
    expect(isPersonalizedItem(null)).toBe(false)
    expect(isPersonalizedItem({})).toBe(false)
    expect(isPersonalizedItem({ text: "K. S." })).toBe(true)
  })
})

describe("exchange and return form (#71)", () => {
  const base = { orderId, orderItemId, subject: "", description: "" }

  it("asks the reason of exchanges and returns", () => {
    const result = openTicketSchema.safeParse({
      ...base,
      kind: "EXCHANGE",
      subject: "Gaveta empenada",
      description: "A gaveta não fecha desde a entrega do produto.",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual(["returnReason"])
  })

  it("keeps the reason of a return", () => {
    expect(
      openTicketSchema.parse({
        ...base,
        kind: "RETURN",
        returnReason: "DEFECT",
        subject: "Gaveta empenada",
        description: "A gaveta não fecha desde a entrega do produto.",
      }).returnReason
    ).toBe("DEFECT")
  })

  it("needs no justification for the withdrawal", () => {
    expect(
      openTicketSchema.parse({
        ...base,
        kind: "WITHDRAWAL",
        returnReason: "OTHER",
      })
    ).toMatchObject({
      kind: "WITHDRAWAL",
      returnReason: null,
      subject: WITHDRAWAL_DEFAULT_SUBJECT,
      description: "",
    })
  })

  it("preselects the kind from the order page", () => {
    expect(ticketFormSourceSchema.parse({ tipo: "arrependimento" })).toEqual({
      tipo: "arrependimento",
    })
    expect(ticketFormSourceSchema.parse({ tipo: "estorno" }).tipo).toBe(
      undefined
    )
  })
})

describe("evaluation of exchanges and returns (#71, RN12, RN22)", () => {
  it("offers only the refund for a withdrawal", () => {
    expect(allowedReturnOutcomes("WITHDRAWAL")).toEqual(["REFUND"])
    expect(allowedReturnOutcomes("EXCHANGE")).toEqual([
      "EXCHANGE",
      "REPAIR",
      "REFUND",
    ])
    expect(allowedReturnOutcomes("WARRANTY")).toEqual([])
  })

  it("never denies a withdrawal, except a pending legal opinion", () => {
    expect(canDenyTicket("WITHDRAWAL", false)).toBe(false)
    expect(canDenyTicket("WITHDRAWAL", true)).toBe(true)
    expect(canDenyTicket("RETURN", false)).toBe(true)
    expect(
      checkReturnResolution({
        kind: "WITHDRAWAL",
        legalReview: false,
        status: "DENIED",
        outcome: "",
      })
    ).toEqual({ ok: false, message: WITHDRAWAL_CANNOT_BE_DENIED_MESSAGE })
  })

  it("records the outcome only after the evaluation resolves it", () => {
    expect(
      checkReturnResolution({
        kind: "RETURN",
        legalReview: false,
        status: "RESOLVED",
        outcome: "",
      })
    ).toEqual({ ok: false, message: RETURN_OUTCOME_REQUIRED_MESSAGE })
    expect(
      checkReturnResolution({
        kind: "WITHDRAWAL",
        legalReview: false,
        status: "RESOLVED",
        outcome: "EXCHANGE",
      })
    ).toEqual({ ok: false, message: RETURN_OUTCOME_REQUIRED_MESSAGE })
    expect(
      checkReturnResolution({
        kind: "EXCHANGE",
        legalReview: false,
        status: "RESOLVED",
        outcome: "REPAIR",
      })
    ).toEqual({ ok: true, outcome: "REPAIR" })
    expect(
      checkReturnResolution({
        kind: "EXCHANGE",
        legalReview: false,
        status: "IN_ANALYSIS",
        outcome: "REPAIR",
      })
    ).toEqual({ ok: true, outcome: null })
    expect(
      checkReturnResolution({
        kind: "WARRANTY",
        legalReview: false,
        status: "RESOLVED",
        outcome: "",
      })
    ).toEqual({ ok: true, outcome: null })
  })

  it("accepts the outcome in the team answer", () => {
    expect(
      supportTicketUpdateSchema.parse({
        ticketId,
        status: "RESOLVED",
        message: "",
        resolution: "Produto conferido e reembolso aprovado.",
        returnOutcome: "REFUND",
      }).returnOutcome
    ).toBe("REFUND")
    expect(
      supportTicketUpdateSchema.safeParse({
        ticketId,
        status: "RESOLVED",
        message: "",
        resolution: "Produto conferido e reembolso aprovado.",
        returnOutcome: "CREDIT",
      }).success
    ).toBe(false)
  })
})
