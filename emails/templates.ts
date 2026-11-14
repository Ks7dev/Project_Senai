import {
  renderEmailHtml,
  renderEmailText,
  type EmailContent,
} from "@/emails/layout"

/** A rendered transactional e-mail, ready for the queue. */
export type RenderedEmail = {
  /** Template key, stored in the queue for tracking. */
  template: string
  /** Subject, in Portuguese. */
  subject: string
  /** Plain text body. */
  text: string
  /** Responsive HTML body. */
  html: string
}

/** Order data shown in the order e-mails. */
export type OrderEmailData = {
  /** Customer first name or full name. */
  name: string
  /** Readable order number. */
  number: string
  /** Order total, decimal string. */
  total: string
  /** Link to the order in Minha conta. */
  url: string
}

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
})

/**
 * Renders a template from its content.
 *
 * @param template - Template key.
 * @param subject - Subject.
 * @param content - Body content.
 * @returns The rendered e-mail.
 */
function render(
  template: string,
  subject: string,
  content: EmailContent
): RenderedEmail {
  return {
    template,
    subject,
    text: renderEmailText(content),
    html: renderEmailHtml(content),
  }
}

/**
 * Order number and total lines.
 *
 * @param order - Order data.
 * @returns Detail lines.
 */
function orderDetails(order: OrderEmailData) {
  return [
    { label: "Pedido", value: order.number },
    { label: "Total", value: brl.format(Number(order.total)) },
  ]
}

/**
 * Welcome e-mail after sign-up (RF53: cadastro).
 *
 * @param input - Name, account type and login link.
 * @returns The e-mail.
 */
export function welcomeEmail(input: {
  name: string
  corporate: boolean
  url: string
}): RenderedEmail {
  return render("account.welcome", "Boas-vindas ao Atelier Bureau", {
    preheader: "Sua conta foi criada.",
    heading: `Boas-vindas, ${input.name}`,
    paragraphs: [
      "Sua conta no Atelier Bureau foi criada.",
      input.corporate
        ? "Como conta corporativa, você pode convidar a equipe, definir aprovadores e solicitar cotações para projetos."
        : "Você já pode salvar favoritos, montar listas de projeto e acompanhar seus pedidos.",
    ],
    action: { label: "Acessar minha conta", url: input.url },
  })
}

/**
 * Quote received or answered (RF53: cotação, RF06).
 *
 * @param input - Name, quote number, stage and link.
 * @returns The e-mail.
 */
export function quoteEmail(input: {
  name: string
  number: string
  stage: "received" | "answered"
  validUntil?: string
  url: string
}): RenderedEmail {
  const answered = input.stage === "answered"
  return render(
    answered ? "quote.answered" : "quote.received",
    answered
      ? `Cotação ${input.number} respondida`
      : `Recebemos a cotação ${input.number}`,
    {
      preheader: answered
        ? "A proposta da sua cotação está disponível."
        : "Nossa equipe comercial já está analisando.",
      heading: answered ? "Sua cotação foi respondida" : "Cotação recebida",
      paragraphs: [
        `Olá, ${input.name}.`,
        answered
          ? "A equipe comercial respondeu à sua cotação. Confira os valores e prazos e aprove para gerar o pedido."
          : "Recebemos sua solicitação de cotação. A equipe comercial vai analisar e responder pelo site.",
        ...(answered && input.validUntil
          ? [`A proposta vale até ${input.validUntil}.`]
          : []),
      ],
      details: [{ label: "Cotação", value: input.number }],
      action: { label: "Ver cotação", url: input.url },
    }
  )
}

/**
 * Order waiting for the corporate approver (RF53: aprovação pendente,
 * RN01).
 *
 * @param input - Approver name, requester, order and link.
 * @returns The e-mail.
 */
export function approvalPendingEmail(
  input: OrderEmailData & { requester: string }
): RenderedEmail {
  return render(
    "order.approval_pending",
    `Pedido ${input.number} aguarda sua aprovação`,
    {
      preheader: `${input.requester} enviou um pedido para aprovação.`,
      heading: "Pedido aguardando aprovação",
      paragraphs: [
        `Olá, ${input.name}.`,
        `${input.requester} fez um pedido acima do limite de aprovação da empresa. Ele só segue para pagamento depois da sua decisão.`,
      ],
      details: orderDetails(input),
      action: { label: "Revisar pedido", url: input.url },
    }
  )
}

/**
 * Order approved by the corporate approver, sent to the requester
 * (RF11, RN01): the order now waits for the payment.
 *
 * @param input - Order data, approver name and the optional note.
 * @returns The e-mail.
 */
export function orderApprovedEmail(
  input: OrderEmailData & { approver: string; note?: string | null }
): RenderedEmail {
  return render(
    "order.approved",
    `Pedido ${input.number} aprovado pela empresa`,
    {
      preheader: "Seu pedido foi aprovado e aguarda o pagamento.",
      heading: "Pedido aprovado",
      paragraphs: [
        `Olá, ${input.name}.`,
        `${input.approver} aprovou o seu pedido. Agora ele aguarda o pagamento para seguir.`,
        ...(input.note ? [`Justificativa: ${input.note}`] : []),
      ],
      details: orderDetails(input),
      action: { label: "Pagar o pedido", url: input.url },
    }
  )
}

/**
 * Payment confirmed or invoiced order approved (RF53: pagamento, RN13).
 *
 * @param input - Order data.
 * @returns The e-mail.
 */
export function paymentConfirmedEmail(input: OrderEmailData): RenderedEmail {
  return render("order.paid", `Pedido ${input.number}: pagamento confirmado`, {
    preheader: "Seu pedido foi confirmado e segue para separação.",
    heading: "Pagamento confirmado",
    paragraphs: [
      `Olá, ${input.name}.`,
      "Seu pedido foi confirmado. Agora ele segue para produção ou separação, e avisaremos a cada etapa.",
    ],
    details: orderDetails(input),
    action: { label: "Acompanhar pedido", url: input.url },
  })
}

/**
 * NF-e issued (RF53: NF-e, RF40).
 *
 * @param input - Order data and the access key, when available.
 * @returns The e-mail.
 */
export function invoiceIssuedEmail(
  input: OrderEmailData & { accessKey?: string | null }
): RenderedEmail {
  return render(
    "order.invoiced",
    `Pedido ${input.number}: nota fiscal emitida`,
    {
      preheader: "A NF-e do seu pedido está disponível.",
      heading: "Nota fiscal emitida",
      paragraphs: [
        `Olá, ${input.name}.`,
        "A nota fiscal eletrônica do seu pedido foi emitida. O XML e o DANFE ficam disponíveis em Minha conta.",
      ],
      details: [
        ...orderDetails(input),
        ...(input.accessKey
          ? [{ label: "Chave de acesso", value: input.accessKey }]
          : []),
      ],
      action: { label: "Ver nota fiscal", url: input.url },
    }
  )
}

/**
 * Order shipped (RF53: envio).
 *
 * @param input - Order data, carrier and tracking code.
 * @returns The e-mail.
 */
export function orderShippedEmail(
  input: OrderEmailData & {
    carrier?: string | null
    trackingCode?: string | null
  }
): RenderedEmail {
  return render("order.shipped", `Pedido ${input.number} a caminho`, {
    preheader: "Seu pedido saiu para entrega.",
    heading: "Seu pedido está a caminho",
    paragraphs: [
      `Olá, ${input.name}.`,
      "Seu pedido saiu do nosso estoque e está em transporte.",
    ],
    details: [
      ...orderDetails(input),
      ...(input.carrier ? [{ label: "Transporte", value: input.carrier }] : []),
      ...(input.trackingCode
        ? [{ label: "Código de rastreio", value: input.trackingCode }]
        : []),
    ],
    action: { label: "Rastrear pedido", url: input.url },
  })
}

/**
 * Order delivered (RF53: entrega).
 *
 * @param input - Order data.
 * @returns The e-mail.
 */
export function orderDeliveredEmail(input: OrderEmailData): RenderedEmail {
  return render("order.delivered", `Pedido ${input.number} entregue`, {
    preheader: "Seu pedido foi entregue.",
    heading: "Pedido entregue",
    paragraphs: [
      `Olá, ${input.name}.`,
      "Seu pedido foi entregue. Se algo não estiver como esperado, abra um chamado em Minha conta.",
    ],
    details: orderDetails(input),
    action: { label: "Ver pedido", url: input.url },
  })
}

/**
 * Order canceled (Pix/boleto expired or canceled by the team).
 *
 * @param input - Order data and the reason shown to the customer.
 * @returns The e-mail.
 */
export function orderCanceledEmail(
  input: OrderEmailData & { reason: string }
): RenderedEmail {
  return render("order.canceled", `Pedido ${input.number} cancelado`, {
    preheader: "Seu pedido foi cancelado.",
    heading: "Pedido cancelado",
    paragraphs: [`Olá, ${input.name}.`, input.reason],
    details: orderDetails(input),
    action: { label: "Ver pedido", url: input.url },
  })
}

/**
 * Support ticket opened or updated (RF53: chamados, RF18).
 *
 * @param input - Name, ticket number, status text and link.
 * @returns The e-mail.
 */
export function supportTicketEmail(input: {
  name: string
  number: string
  status: string
  message: string
  url: string
}): RenderedEmail {
  return render("support.ticket", `Chamado ${input.number}: ${input.status}`, {
    preheader: `Atualização do chamado ${input.number}.`,
    heading: `Chamado ${input.number}`,
    paragraphs: [`Olá, ${input.name}.`, input.message],
    details: [
      { label: "Chamado", value: input.number },
      { label: "Situação", value: input.status },
    ],
    action: { label: "Ver chamado", url: input.url },
  })
}

/**
 * Demonstration request received, confirmed or canceled, sent to the
 * customer (RF19, RF53).
 *
 * @param input - Name, stage, date, mode, product, team note and link.
 * @returns The e-mail.
 */
export function demoCustomerEmail(input: {
  name: string
  stage: "received" | "confirmed" | "canceled"
  when: string
  mode: string
  product: string | null
  note?: string | null
  url: string
}): RenderedEmail {
  const copy = {
    received: {
      subject: "Recebemos o seu pedido de demonstração",
      heading: "Demonstração solicitada",
      text: "Recebemos o seu pedido de demonstração. O seu vendedor confirma a data e o horário em breve.",
    },
    confirmed: {
      subject: "Demonstração confirmada",
      heading: "Demonstração confirmada",
      text: "A sua demonstração está confirmada. Até lá!",
    },
    canceled: {
      subject: "Demonstração cancelada",
      heading: "Demonstração cancelada",
      text: "A demonstração foi cancelada. Escolha outra data no site quando quiser.",
    },
  }[input.stage]
  return render(`demo.${input.stage}`, copy.subject, {
    preheader: `${input.when} · ${input.mode}`,
    heading: copy.heading,
    paragraphs: [
      `Olá, ${input.name}.`,
      copy.text,
      ...(input.note ? [`Mensagem da equipe: ${input.note}`] : []),
    ],
    details: [
      { label: "Data e horário", value: input.when },
      { label: "Formato", value: input.mode },
      ...(input.product ? [{ label: "Produto", value: input.product }] : []),
    ],
    action: { label: "Ver demonstrações", url: input.url },
  })
}

/**
 * New demonstration request, sent to the seller who receives it (RF19).
 *
 * @param input - Seller name, customer, date, mode, product and link.
 * @returns The e-mail.
 */
export function demoSalesEmail(input: {
  sellerName: string
  customer: string
  company: string | null
  when: string
  mode: string
  product: string | null
  url: string
}): RenderedEmail {
  return render("demo.sales", `Nova demonstração: ${input.when}`, {
    preheader: `${input.customer} pediu uma demonstração.`,
    heading: "Nova solicitação de demonstração",
    paragraphs: [
      `Olá, ${input.sellerName}.`,
      `${input.customer}${input.company ? ` (${input.company})` : ""} pediu uma demonstração. Confirme ou cancele no back office.`,
    ],
    details: [
      { label: "Data e horário", value: input.when },
      { label: "Formato", value: input.mode },
      ...(input.product ? [{ label: "Produto", value: input.product }] : []),
    ],
    action: { label: "Abrir demonstrações", url: input.url },
  })
}
