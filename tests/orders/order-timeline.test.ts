import { describe, expect, it } from "vitest"
import {
  buildOrderTimeline,
  type TimelineInput,
} from "@/features/shared/lib/orders/order-timeline"

const base: TimelineInput = {
  status: "AWAITING_PAYMENT",
  history: [{ to: "AWAITING_PAYMENT", at: "2026-11-11T13:00:00.000Z" }],
  requiresApproval: false,
  invoiced: false,
  needsProduction: false,
  hasInstallation: false,
}

/**
 * Status and state of each step, for compact assertions.
 *
 * @param input - Timeline input.
 * @returns Pairs "STATUS:state".
 */
function states(input: TimelineInput) {
  return buildOrderTimeline(input).map((step) => `${step.status}:${step.state}`)
}

describe("order timeline (#66, RF15)", () => {
  it("shows every status of the path with the next ones pending", () => {
    expect(states(base)).toEqual([
      "AWAITING_PAYMENT:current",
      "PAID:pending",
      "SEPARATING:pending",
      "INVOICED:pending",
      "SHIPPED:pending",
      "DELIVERED:pending",
    ])
    const [first] = buildOrderTimeline(base)
    expect(first).toMatchObject({
      label: "Aguardando pagamento",
      at: "2026-11-11T13:00:00.000Z",
    })
    expect(first.description).toBeTruthy()
  })

  it("adds approval, production and installation when the order needs them", () => {
    expect(
      states({
        ...base,
        status: "AWAITING_APPROVAL",
        history: [{ to: "AWAITING_APPROVAL", at: "2026-11-11T13:00:00.000Z" }],
        requiresApproval: true,
        needsProduction: true,
        hasInstallation: true,
      })
    ).toEqual([
      "AWAITING_APPROVAL:current",
      "AWAITING_PAYMENT:pending",
      "PAID:pending",
      "IN_PRODUCTION:pending",
      "SEPARATING:pending",
      "INVOICED:pending",
      "SHIPPED:pending",
      "DELIVERED:pending",
      "INSTALLED:pending",
    ])
  })

  it("skips the online payment of an invoiced order", () => {
    expect(
      states({
        ...base,
        status: "PAID",
        history: [{ to: "PAID", at: "2026-11-11T13:00:00.000Z" }],
        invoiced: true,
      })[0]
    ).toBe("PAID:current")
  })

  it("keeps the dates of the steps already reached", () => {
    const steps = buildOrderTimeline({
      ...base,
      status: "SHIPPED",
      history: [
        { to: "AWAITING_PAYMENT", at: "2026-11-11T13:00:00.000Z" },
        { to: "PAID", at: "2026-11-11T14:00:00.000Z" },
        { to: "SEPARATING", at: "2026-11-12T10:00:00.000Z" },
        { to: "INVOICED", at: "2026-11-12T12:00:00.000Z" },
        { to: "SHIPPED", at: "2026-11-13T09:00:00.000Z" },
      ],
    })
    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "done",
      "current",
      "pending",
    ])
    expect(steps[4].at).toBe("2026-11-13T09:00:00.000Z")
    expect(steps[5].at).toBeNull()
  })

  it("finishes on delivery, or on installation when there is one", () => {
    expect(states({ ...base, status: "DELIVERED" }).at(-1)).toBe(
      "DELIVERED:done"
    )
    expect(
      states({ ...base, status: "DELIVERED", hasInstallation: true }).slice(-2)
    ).toEqual(["DELIVERED:current", "INSTALLED:pending"])
    expect(
      states({ ...base, status: "INSTALLED", hasInstallation: true }).at(-1)
    ).toBe("INSTALLED:done")
  })

  it("ends a canceled or refunded order in the exit, without next steps", () => {
    expect(
      states({
        ...base,
        status: "CANCELED",
        history: [
          { to: "AWAITING_PAYMENT", at: "2026-11-11T13:00:00.000Z" },
          { to: "CANCELED", at: "2026-11-11T14:00:00.000Z" },
        ],
      })
    ).toEqual(["AWAITING_PAYMENT:done", "CANCELED:problem"])
    expect(
      states({
        ...base,
        status: "REFUNDED",
        history: [
          { to: "AWAITING_PAYMENT", at: "2026-11-11T13:00:00.000Z" },
          { to: "PAID", at: "2026-11-11T14:00:00.000Z" },
          { to: "CANCELED", at: "2026-11-11T15:00:00.000Z" },
          { to: "REFUNDED", at: "2026-11-11T16:00:00.000Z" },
        ],
      })
    ).toEqual([
      "AWAITING_PAYMENT:done",
      "PAID:done",
      "CANCELED:done",
      "REFUNDED:problem",
    ])
  })
})
