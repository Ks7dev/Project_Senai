import { describe, expect, it } from "vitest"
import { supportTicketEmail } from "@/emails/templates"
import { supportTicketUpdateSchema } from "@/features/after-sales/support-desk/schema/support-desk-schema"
import {
  openTicketSchema,
  ticketFormSourceSchema,
  ticketReplySchema,
} from "@/features/after-sales/support-tickets/schema/support-ticket-schema"
import {
  canOpenTicketForOrder,
  formatTicketNumber,
  orderDeliveredAt,
  warrantyCoverage,
} from "@/features/shared/lib/support/ticket-format"
import {
  canChangeTicketStatus,
  isFinalTicketStatus,
  nextTicketStatuses,
  statusAfterCustomerReply,
  TICKET_STATUSES,
} from "@/features/shared/lib/support/ticket-status"
import { supportAttachmentsSchema } from "@/features/shared/schema/support-attachments-schema"

const orderId = "019a7b1e-0000-7000-8000-000000000001"
const orderItemId = "019a7b1e-0000-7000-8000-000000000002"
const ticketId = "019a7b1e-0000-7000-8000-000000000003"

describe("opening a ticket (#68, RF17)", () => {
  it("links the ticket to an order and an item and trims the texts", () => {
    expect(
      openTicketSchema.parse({
        orderId,
        orderItemId,
        kind: "WARRANTY",
        subject: "  Pistão desce sozinho ",
        description: "  A cadeira perde altura depois de alguns minutos.  ",
      })
    ).toEqual({
      orderId,
      orderItemId,
      kind: "WARRANTY",
      subject: "Pistão desce sozinho",
      description: "A cadeira perde altura depois de alguns minutos.",
    })
  })

  it("refuses a ticket without item, unknown kinds and short texts", () => {
    const base = {
      orderId,
      orderItemId,
      kind: "TECHNICAL_ASSISTANCE",
      subject: "Dimmer falhando",
      description: "A luminária pisca quando o dimmer está no mínimo.",
    }
    expect(openTicketSchema.safeParse(base).success).toBe(true)
    expect(
      openTicketSchema.safeParse({ ...base, orderItemId: "" }).success
    ).toBe(false)
    expect(
      openTicketSchema.safeParse({ ...base, kind: "REFUND" }).success
    ).toBe(false)
    expect(
      openTicketSchema.safeParse({ ...base, description: "Quebrou." }).success
    ).toBe(false)
  })

  it("ignores invalid ids in the query string", () => {
    expect(
      ticketFormSourceSchema.parse({ pedido: "1 OR 1=1", item: orderItemId })
    ).toEqual({ pedido: undefined, item: orderItemId })
  })

  it("only opens tickets for delivered orders", () => {
    expect(canOpenTicketForOrder("DELIVERED")).toBe(true)
    expect(canOpenTicketForOrder("INSTALLED")).toBe(true)
    expect(canOpenTicketForOrder("SHIPPED")).toBe(false)
    expect(canOpenTicketForOrder("CANCELED")).toBe(false)
  })

  it("accepts photos and PDFs within the limits", () => {
    expect(
      supportAttachmentsSchema.safeParse([
        { name: "foto.jpg", type: "image/jpeg", size: 1024 },
      ]).success
    ).toBe(true)
    expect(
      supportAttachmentsSchema.safeParse([
        { name: "video.mp4", type: "video/mp4", size: 1024 },
      ]).success
    ).toBe(false)
  })

  it("formats the readable ticket number", () => {
    expect(formatTicketNumber(2026, 42)).toBe("CHA-2026-000042")
  })
})

describe("ticket status followed by the customer (#68)", () => {
  it("moves along the allowed path and ends at resolved or denied", () => {
    expect(canChangeTicketStatus("OPEN", "IN_ANALYSIS")).toBe(true)
    expect(canChangeTicketStatus("IN_ANALYSIS", "WAITING_CUSTOMER")).toBe(true)
    expect(canChangeTicketStatus("WAITING_CUSTOMER", "RESOLVED")).toBe(true)
    expect(canChangeTicketStatus("IN_ANALYSIS", "OPEN")).toBe(false)
    for (const status of ["RESOLVED", "DENIED"] as const) {
      expect(isFinalTicketStatus(status)).toBe(true)
      expect(nextTicketStatuses(status)).toEqual([])
    }
    for (const status of TICKET_STATUSES) {
      expect(nextTicketStatuses(status)).not.toContain(status)
    }
  })

  it("sends a ticket waiting for the customer back to the team", () => {
    expect(statusAfterCustomerReply("WAITING_CUSTOMER")).toBe("IN_ANALYSIS")
    expect(statusAfterCustomerReply("OPEN")).toBe("OPEN")
  })

  it("validates the customer reply", () => {
    expect(
      ticketReplySchema.safeParse({ ticketId, message: " " }).success
    ).toBe(false)
    expect(
      ticketReplySchema.safeParse({ ticketId, message: "Seguem as fotos." })
        .success
    ).toBe(true)
  })

  it("requires the outcome to resolve or deny and something to answer", () => {
    const base = { ticketId, status: "", message: "", resolution: "" }
    expect(supportTicketUpdateSchema.safeParse(base).success).toBe(false)
    expect(
      supportTicketUpdateSchema.safeParse({ ...base, status: "IN_ANALYSIS" })
        .success
    ).toBe(true)
    const denied = supportTicketUpdateSchema.safeParse({
      ...base,
      status: "DENIED",
      resolution: "Queda",
    })
    expect(denied.success).toBe(false)
    expect(denied.error?.issues[0]?.path).toEqual(["resolution"])
    expect(
      supportTicketUpdateSchema.safeParse({
        ...base,
        status: "RESOLVED",
        resolution: "Pistão substituído na garantia.",
      }).success
    ).toBe(true)
  })

  it("e-mails the customer with the status and the link", () => {
    const email = supportTicketEmail({
      name: "Cliente",
      number: "CHA-2026-000001",
      status: "Em análise",
      message: "Recebemos o produto.",
      url: "https://loja.test/conta/chamados/1",
    })
    expect(email.subject).toBe("Chamado CHA-2026-000001: Em análise")
    expect(email.text).toContain("Recebemos o produto.")
    expect(email.text).toContain("https://loja.test/conta/chamados/1")
  })
})

describe("warranty coverage estimate (commercial policy 2.1)", () => {
  const deliveredAt = new Date("2026-01-31T15:00:00.000Z")

  it("adds the legal 90 days and the contractual months", () => {
    const coverage = warrantyCoverage({
      deliveredAt,
      warrantyMonths: 12,
      now: new Date("2027-04-30T12:00:00.000Z"),
    })
    expect(coverage.until?.toISOString()).toBe("2027-05-01T15:00:00.000Z")
    expect(coverage.withinCoverage).toBe(true)
    expect(
      warrantyCoverage({
        deliveredAt,
        warrantyMonths: 12,
        now: new Date("2027-05-02T00:00:00.000Z"),
      }).withinCoverage
    ).toBe(false)
  })

  it("has no estimate before the delivery", () => {
    expect(
      warrantyCoverage({
        deliveredAt: null,
        warrantyMonths: 6,
        now: new Date(),
      })
    ).toEqual({ until: null, withinCoverage: null })
  })

  it("takes the shipment date or the first delivered status", () => {
    const first = new Date("2026-03-01T10:00:00.000Z")
    const later = new Date("2026-03-05T10:00:00.000Z")
    expect(
      orderDeliveredAt({
        shipmentDeliveredAt: null,
        history: [
          { toStatus: "DELIVERED", createdAt: later },
          { toStatus: "SHIPPED", createdAt: new Date("2026-02-27") },
          { toStatus: "DELIVERED", createdAt: first },
        ],
      })
    ).toEqual(first)
    expect(
      orderDeliveredAt({ shipmentDeliveredAt: later, history: [] })
    ).toEqual(later)
    expect(orderDeliveredAt({ shipmentDeliveredAt: null, history: [] })).toBe(
      null
    )
  })
})
