import { describe, expect, it } from "vitest"
import { demoCustomerEmail, demoSalesEmail } from "@/emails/templates"
import { demoDecisionSchema } from "@/features/after-sales/demo-desk/schema/demo-desk-schema"
import { demoRequestSchema } from "@/features/after-sales/demo-scheduling/schema/demo-scheduling-schema"
import {
  buildDemoAgenda,
  demoSlotStart,
  earliestDemoDate,
  isDemoSlotAvailable,
  nextDemoStatuses,
  parseDemoRules,
  type DemoRules,
} from "@/features/shared/lib/demos/demo-calendar"
import { demoSettings } from "@/prisma/seed-data"

/**
 * Rules of the seed, parsed like the server does.
 *
 * @returns The rules.
 */
function seededRules(): DemoRules {
  const value = (key: string) =>
    demoSettings.find((setting) => setting.key === `demo.${key}`)?.value
  return parseDemoRules({
    minBusinessDays: value("min_business_days"),
    windowDays: value("window_days"),
    weekdays: value("weekdays"),
    timeSlots: value("time_slots"),
    slotCapacity: value("slot_capacity"),
    blockedDates: value("blocked_dates"),
  })
}

// Saturday 14/11/2026, 10:00 in São Paulo
const now = new Date("2026-11-14T13:00:00.000Z")

describe("demonstration agenda (#70, RF19)", () => {
  const rules = seededRules()

  it("reads the agenda from the seeded settings", () => {
    expect(rules.timeSlots).toEqual([
      "09:30",
      "11:00",
      "14:00",
      "15:30",
      "17:00",
    ])
    expect(rules.slotCapacity).toBe(1)
  })

  it("refuses invalid settings", () => {
    expect(() =>
      parseDemoRules({
        minBusinessDays: 1,
        windowDays: 30,
        weekdays: [1],
        timeSlots: ["25:00"],
        slotCapacity: 1,
        blockedDates: [],
      })
    ).toThrow("time_slots")
  })

  it("starts after the notice, skips weekends and holidays", () => {
    expect(earliestDemoDate(now, rules)).toBe("2026-11-16")
    const agenda = buildDemoAgenda({ now, rules, booked: new Map() })
    const dates = agenda.map((day) => day.date)
    expect(dates[0]).toBe("2026-11-16")
    expect(dates).not.toContain("2026-11-20")
    expect(dates).not.toContain("2026-11-21")
    expect(agenda[0].slots.every((slot) => slot.available)).toBe(true)
  })

  it("converts São Paulo times to UTC", () => {
    expect(demoSlotStart("2026-11-16", "14:00").toISOString()).toBe(
      "2026-11-16T17:00:00.000Z"
    )
  })

  it("blocks a full slot, unknown times and dates out of the window", () => {
    const start = demoSlotStart("2026-11-16", "14:00").toISOString()
    const booked = new Map([[start, 1]])
    const base = { date: "2026-11-16", now, rules, booked }
    expect(isDemoSlotAvailable({ ...base, time: "14:00" })).toBe(false)
    expect(isDemoSlotAvailable({ ...base, time: "15:30" })).toBe(true)
    expect(isDemoSlotAvailable({ ...base, time: "15:00" })).toBe(false)
    expect(
      isDemoSlotAvailable({ ...base, date: "2026-11-14", time: "15:30" })
    ).toBe(false)
    expect(
      isDemoSlotAvailable({ ...base, date: "2027-03-01", time: "15:30" })
    ).toBe(false)
  })
})

describe("demonstration request and decision (#70)", () => {
  it("validates the date, time and format picked by the customer", () => {
    expect(
      demoRequestSchema.parse({
        date: "2026-11-16",
        time: "14:00",
        mode: "ONLINE",
        phone: "(11) 91234-5678",
      })
    ).toEqual({
      date: "2026-11-16",
      time: "14:00",
      mode: "ONLINE",
      productSlug: "",
      phone: "11912345678",
      notes: "",
    })
    expect(
      demoRequestSchema.safeParse({
        date: "16/11/2026",
        time: "14:00",
        mode: "ONLINE",
      }).success
    ).toBe(false)
    expect(
      demoRequestSchema.safeParse({
        date: "2026-11-16",
        time: "14:00",
        mode: "PHONE",
      }).success
    ).toBe(false)
  })

  it("lets the team confirm, cancel with a reason and close", () => {
    expect(nextDemoStatuses("REQUESTED")).toEqual(["CONFIRMED", "CANCELED"])
    expect(nextDemoStatuses("CONFIRMED")).toEqual(["DONE", "CANCELED"])
    expect(nextDemoStatuses("DONE")).toEqual([])
    const requestId = "019a7b1e-0000-7000-8000-000000000009"
    expect(
      demoDecisionSchema.safeParse({ requestId, status: "CANCELED" }).success
    ).toBe(false)
    expect(
      demoDecisionSchema.safeParse({
        requestId,
        status: "CANCELED",
        note: "Vendedor em viagem; escolha outra data.",
      }).success
    ).toBe(true)
  })

  it("e-mails the customer and the seller", () => {
    const customer = demoCustomerEmail({
      name: "Cliente",
      stage: "received",
      when: "segunda-feira, 16 de novembro às 14:00",
      mode: "Online, por videochamada",
      product: "Mesa com regulagem elétrica",
      url: "https://loja.test/demonstracao",
    })
    expect(customer.template).toBe("demo.received")
    expect(customer.text).toContain("Mesa com regulagem elétrica")
    const sales = demoSalesEmail({
      sellerName: "Equipe Comercial",
      customer: "Cliente",
      company: "Empresa Fictícia",
      when: "segunda-feira, 16 de novembro às 14:00",
      mode: "No showroom da Atelier Bureau",
      product: null,
      url: "https://loja.test/admin/atendimento/demonstracoes",
    })
    expect(sales.subject).toContain("Nova demonstração")
    expect(sales.text).toContain("Cliente (Empresa Fictícia)")
  })
})
