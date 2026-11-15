/** Payment statuses as the customer sees them (RF31). */
export const PAYMENT_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "progress" | "done" | "problem" }
> = {
  PENDING: { label: "Aguardando confirmação", tone: "neutral" },
  APPROVED: { label: "Aprovado", tone: "done" },
  REJECTED: { label: "Recusado", tone: "problem" },
  CANCELED: { label: "Cancelado", tone: "problem" },
  EXPIRED: { label: "Expirado", tone: "problem" },
  REFUNDED: { label: "Estornado", tone: "problem" },
  PARTIALLY_REFUNDED: { label: "Estornado parcialmente", tone: "progress" },
}

/** Payment methods as the customer sees them (RF29). */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CARD: "Cartão de crédito",
  PIX: "Pix",
  BOLETO: "Boleto",
  INVOICED: "Faturado",
}

/** Messages for the Mercado Pago status details the customer can act on. */
const STATUS_DETAIL_MESSAGES: Record<string, string> = {
  accredited: "Pagamento aprovado.",
  pending_contingency:
    "Estamos processando o pagamento. Você recebe a confirmação por e-mail.",
  pending_review_manual:
    "O pagamento está em análise. Você recebe a confirmação por e-mail.",
  pending_challenge:
    "Seu banco pediu uma confirmação adicional. Conclua a autenticação para seguir.",
  pending_waiting_payment: "Aguardando o pagamento.",
  pending_waiting_transfer: "Aguardando o pagamento.",
  cc_rejected_bad_filled_card_number:
    "Confira o número do cartão e tente novamente.",
  cc_rejected_bad_filled_date: "Confira a validade do cartão.",
  cc_rejected_bad_filled_other: "Confira os dados do cartão.",
  cc_rejected_bad_filled_security_code: "Confira o código de segurança.",
  cc_rejected_blacklist:
    "Não foi possível processar o pagamento. Use outro cartão.",
  cc_rejected_call_for_authorize:
    "Autorize o pagamento junto ao banco emissor do cartão e tente novamente.",
  cc_rejected_card_disabled:
    "Ative o cartão junto ao banco emissor ou use outro cartão.",
  cc_rejected_duplicated_payment:
    "Você já fez um pagamento com esse valor. Se precisar pagar de novo, use outro cartão.",
  cc_rejected_high_risk:
    "O pagamento foi recusado por segurança. Use outro cartão ou outra forma de pagamento.",
  cc_rejected_insufficient_amount: "O cartão não tem limite suficiente.",
  cc_rejected_invalid_installments:
    "O cartão não aceita esse número de parcelas.",
  cc_rejected_max_attempts:
    "Você atingiu o limite de tentativas. Use outro cartão.",
  cc_rejected_other_reason:
    "O banco emissor não aprovou o pagamento. Use outro cartão.",
  cc_rejected_3ds_challenge:
    "A autenticação do banco não foi concluída. Tente novamente.",
  amount_mismatch:
    "O pagamento está em conferência pela nossa equipe financeira.",
  provider_refused:
    "O Mercado Pago recusou os dados do pagamento. Revise e tente novamente.",
  provider_unconfirmed:
    "Estamos confirmando o pagamento com o Mercado Pago. Acompanhe o status nesta página.",
}

/**
 * Customer message for a payment status detail.
 *
 * @param status - Stored payment status.
 * @param detail - Mercado Pago status detail, if any.
 * @returns The message, in Portuguese.
 */
export function paymentStatusMessage(
  status: string,
  detail: string | null | undefined
): string {
  if (detail && STATUS_DETAIL_MESSAGES[detail]) {
    return STATUS_DETAIL_MESSAGES[detail]
  }
  switch (status) {
    case "APPROVED":
      return "Pagamento aprovado."
    case "REJECTED":
      return "O pagamento não foi aprovado. Tente novamente ou use outro cartão."
    case "CANCELED":
      return "O pagamento foi cancelado."
    case "EXPIRED":
      return "O prazo de pagamento terminou."
    case "REFUNDED":
    case "PARTIALLY_REFUNDED":
      return "O pagamento foi estornado."
    default:
      return "Aguardando a confirmação do pagamento."
  }
}
