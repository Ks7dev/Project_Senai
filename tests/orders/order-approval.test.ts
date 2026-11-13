import { describe, expect, it } from "vitest"
import { orderApprovedEmail } from "@/emails/templates"
import {
  APPROVAL_NOTE_MAX,
  orderApprovalSchema,
} from "@/features/orders/order-approval/schema/order-approval-schema"
import { canDecideOrderApproval } from "@/features/shared/lib/auth/corporate-roles"

const orderId = "019a7b1e-0000-7000-8000-000000000001"

describe("approval decision schema (#51, RF11)", () => {
  it("accepts an approval without justification and trims the note", () => {
    expect(
      orderApprovalSchema.parse({ orderId, decision: "APPROVED", note: "  " })
    ).toEqual({ orderId, decision: "APPROVED", note: "" })
    expect(
      orderApprovalSchema.parse({
        orderId,
        decision: "APPROVED",
        note: " De acordo. ",
      }).note
    ).toBe("De acordo.")
  })

  it("requires a justification to refuse", () => {
    const short = orderApprovalSchema.safeParse({
      orderId,
      decision: "REJECTED",
      note: "não",
    })
    expect(short.success).toBe(false)
    expect(short.error?.issues[0]).toMatchObject({
      path: ["note"],
      message: "Explique o motivo da recusa (mínimo de 10 caracteres).",
    })
    expect(
      orderApprovalSchema.safeParse({
        orderId,
        decision: "REJECTED",
        note: "Fora do orçamento.",
      }).success
    ).toBe(true)
  })

  it("refuses unknown decisions, invalid ids and long notes", () => {
    expect(
      orderApprovalSchema.safeParse({ orderId, decision: "MAYBE", note: "" })
        .success
    ).toBe(false)
    expect(
      orderApprovalSchema.safeParse({
        orderId: "1",
        decision: "APPROVED",
        note: "",
      }).success
    ).toBe(false)
    expect(
      orderApprovalSchema.safeParse({
        orderId,
        decision: "APPROVED",
        note: "a".repeat(APPROVAL_NOTE_MAX + 1),
      }).success
    ).toBe(false)
  })
})

describe("who decides an approval (RN01, RN08)", () => {
  it("needs the approver role", () => {
    expect(
      canDecideOrderApproval({
        roles: ["requester", "admin", "finance"],
        isRequester: false,
        memberCount: 3,
      })
    ).toBe(false)
    expect(
      canDecideOrderApproval({
        roles: ["approver"],
        isRequester: false,
        memberCount: 3,
      })
    ).toBe(true)
  })

  it("never lets the requester decide in a multi-user account", () => {
    expect(
      canDecideOrderApproval({
        roles: ["approver", "admin"],
        isRequester: true,
        memberCount: 2,
      })
    ).toBe(false)
  })

  it("lets the holder of a single-user account decide", () => {
    expect(
      canDecideOrderApproval({
        roles: ["approver", "admin"],
        isRequester: true,
        memberCount: 1,
      })
    ).toBe(true)
  })
})

describe("order approved e-mail (#51)", () => {
  it("names the approver and shows the justification when there is one", () => {
    const base = {
      name: "Solicitante",
      number: "AB-2026-000123",
      total: "12000.00",
      url: "https://loja.test/conta/pedidos/1/pagamento",
      approver: "Aprovadora Fictícia",
    }
    const email = orderApprovedEmail({ ...base, note: "Dentro do orçamento." })
    expect(email.template).toBe("order.approved")
    expect(email.subject).toBe("Pedido AB-2026-000123 aprovado pela empresa")
    expect(email.text).toContain("Aprovadora Fictícia aprovou o seu pedido")
    expect(email.text).toContain("Justificativa: Dentro do orçamento.")
    expect(orderApprovedEmail(base).text).not.toContain("Justificativa")
  })
})
