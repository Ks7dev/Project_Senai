import { describe, expect, it } from "vitest"
import {
  ORDER_STATUS_KEYS,
  updateOrderStatusSchema,
} from "@/features/orders/order-management/schema/order-management-schema"
import {
  canTransition,
  manualNextStatuses,
  ORDER_STATUS,
  ORDER_TRANSITIONS,
} from "@/features/shared/lib/orders/order-status"

describe("order life cycle (#65, RF54)", () => {
  it("has a label and a transition list for every status", () => {
    for (const status of ORDER_STATUS_KEYS) {
      expect(ORDER_STATUS[status].label).not.toBe("")
      expect(Array.isArray(ORDER_TRANSITIONS[status])).toBe(true)
    }
  })

  it("follows the fulfillment path in order", () => {
    const path = [
      "AWAITING_PAYMENT",
      "PAID",
      "IN_PRODUCTION",
      "SEPARATING",
      "INVOICED",
      "SHIPPED",
      "DELIVERED",
      "INSTALLED",
    ] as const
    for (let i = 1; i < path.length; i++) {
      expect(canTransition(path[i - 1], path[i])).toBe(true)
    }
  })

  it("refuses skipping steps, going back and leaving final statuses", () => {
    expect(canTransition("AWAITING_PAYMENT", "SHIPPED")).toBe(false)
    expect(canTransition("SEPARATING", "SHIPPED")).toBe(false)
    expect(canTransition("DELIVERED", "SHIPPED")).toBe(false)
    expect(canTransition("INVOICED", "CANCELED")).toBe(false)
    expect(canTransition("CANCELED", "PAID")).toBe(false)
    expect(ORDER_TRANSITIONS.REFUNDED).toEqual([])
    expect(canTransition("PAID", "PAID")).toBe(false)
  })

  it("lets invoiced orders go from approval straight to paid/approved", () => {
    expect(canTransition("AWAITING_APPROVAL", "PAID")).toBe(true)
  })

  it("offers only manual statuses covered by the user's permissions", () => {
    const stock = new Set([
      "order:status:update",
      "shipment:manage",
      "order:read",
    ])
    expect(manualNextStatuses("PAID", stock)).toEqual([
      "IN_PRODUCTION",
      "SEPARATING",
    ])
    expect(manualNextStatuses("SEPARATING", stock)).toEqual([])
    expect(manualNextStatuses("INVOICED", stock)).toEqual(["SHIPPED"])
    expect(
      manualNextStatuses("SEPARATING", new Set(["invoice:manage"]))
    ).toEqual(["INVOICED"])
    // Payment and refund are never set by hand
    expect(
      manualNextStatuses("AWAITING_PAYMENT", new Set(["order:cancel"]))
    ).toEqual(["CANCELED"])
  })
})

describe("status change form (#65)", () => {
  const orderId = "0195f0c2-6b1a-7d4e-9a3b-1c2d3e4f5a6b"

  it("requires a reason to cancel", () => {
    const result = updateOrderStatusSchema.safeParse({
      orderId,
      to: "CANCELED",
      cancellationReason: "",
    })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe(
      "Informe o motivo do cancelamento."
    )
  })

  it("ignores an empty reason for other statuses", () => {
    expect(
      updateOrderStatusSchema.parse({
        orderId,
        to: "SEPARATING",
        cancellationReason: "",
      })
    ).toEqual({ orderId, to: "SEPARATING", note: "", trackingCode: "" })
  })

  it("accepts only a plain tracking code (#66)", () => {
    expect(
      updateOrderStatusSchema.parse({
        orderId,
        to: "SHIPPED",
        trackingCode: " AA123456789BR ",
      }).trackingCode
    ).toBe("AA123456789BR")
    expect(
      updateOrderStatusSchema.safeParse({
        orderId,
        to: "SHIPPED",
        trackingCode: "<script>",
      }).success
    ).toBe(false)
  })
})
