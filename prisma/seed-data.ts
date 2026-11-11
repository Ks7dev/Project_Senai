/**
 * Seed data for development and the academic demo (#8). Every company,
 * person and document here is fictitious.
 */

/** A business rule value stored in the `settings` table. */
export type SettingSeed = {
  /** Stable key read by the code. */
  key: string
  /** JSON value. */
  value: unknown
  /** Description shown in the back office, in Portuguese. */
  description: string
}

/**
 * Business rule values confirmed in issue #5. They live in the
 * database and are editable in the back office, never hardcoded.
 */
export const settings: SettingSeed[] = [
  {
    key: "order.approval_limit",
    value: "10000.00",
    description: "Pedidos acima deste valor exigem aprovação (RN01)",
  },
  {
    key: "product.extended_warranty_threshold",
    value: "5000.00",
    description:
      "Produtos acima deste valor já incluem garantia estendida (RN06)",
  },
  {
    key: "payment.pix_expiration_minutes",
    value: 30,
    description: "Prazo de expiração do Pix, em minutos (RN14)",
  },
  {
    key: "payment.boleto_expiration_business_days",
    value: 3,
    description: "Prazo de expiração do boleto, em dias úteis (RN14)",
  },
  {
    key: "quote.validity_days",
    value: 15,
    description: "Validade da cotação respondida, em dias (RN02)",
  },
  {
    key: "shipping.correios_max_weight_kg",
    value: 30,
    description: "Peso máximo por volume para os Correios (RN20)",
  },
  {
    key: "shipping.correios_max_side_cm",
    value: 100,
    description: "Maior lado máximo por volume para os Correios (RN20)",
  },
  {
    key: "shipping.correios_max_dimensions_sum_cm",
    value: 200,
    description: "Soma máxima das dimensões para os Correios (RN20)",
  },
  {
    key: "shipping.cubage_factor",
    value: 6000,
    description: "Fator de cubagem: peso cubado = C × L × A (cm) ÷ fator (#40)",
  },
  {
    key: "shipping.manual_quote_response_business_days",
    value: 2,
    description:
      "Prazo de retorno da cotação manual de frete, em dias úteis (RN20)",
  },
  {
    key: "payment.invoiced_due_days",
    value: [28, 56],
    description: "Vencimentos do pagamento faturado, em dias (RN03)",
  },
  {
    key: "personalization.engraving",
    value: { price: "90.00", extraBusinessDays: 3, maxLength: 30 },
    description:
      "Gravação a laser por unidade: preço, dias úteis a mais no prazo e limite de caracteres (RF51)",
  },
  {
    key: "cart.additional_services",
    value: [
      {
        key: "institutional_packaging",
        label: "Embalagem institucional",
        description: "Caixa rígida com a identidade da empresa e cartão.",
        price: "35.00",
        courtesy: false,
        extraBusinessDays: 1,
        eligibility: "all",
      },
      {
        key: "assembly",
        label: "Montagem",
        description: "Montagem no local por equipe própria ou parceira.",
        price: "250.00",
        courtesy: false,
        extraBusinessDays: 0,
        eligibility: "installation",
      },
    ],
    description:
      "Serviços adicionais do carrinho por unidade: preço ou cortesia, dias úteis a mais e produtos elegíveis (RF52)",
  },
]

/** A CEP range of the delivery coverage. */
export type ShippingRegionSeed = {
  /** Region name, in Portuguese. */
  name: string
  /** First CEP of the range, digits only. */
  cepStart: string
  /** Last CEP of the range, digits only. */
  cepEnd: string
  /** Whether the store delivers and assembles with its own team. */
  ownDelivery: boolean
  /** Own delivery prices by maximum weight. */
  ownDeliveryRates?: Array<{ maxKg: number; price: string }>
}

/**
 * Own delivery coverage: São Paulo Metropolitan Region (RN16). The free
 * shipping minimum per region (RN23) is still to be defined (#73).
 */
export const shippingRegions: ShippingRegionSeed[] = [
  {
    name: "Região Metropolitana de São Paulo",
    cepStart: "01000000",
    cepEnd: "09999999",
    ownDelivery: true,
    ownDeliveryRates: [
      { maxKg: 30, price: "120.00" },
      { maxKg: 100, price: "240.00" },
      { maxKg: 300, price: "480.00" },
    ],
  },
]

/** Internal role with its permissions (RF55). */
export type RoleSeed = {
  /** Stable key in English. */
  key: string
  /** Display name, in Portuguese. */
  name: string
  /** Permissions as "resource:action". */
  permissions: string[]
}

/** Every internal permission, as "resource:action". */
export const permissions: string[] = [
  "product:read",
  "product:create",
  "product:update",
  "product:delete",
  "category:manage",
  "stock:read",
  "stock:update",
  "order:read",
  "order:status:update",
  "order:cancel",
  "shipment:manage",
  "quote:read",
  "quote:answer",
  "customer:read",
  "customer:update",
  "credit:approve",
  "payment:refund",
  "invoice:manage",
  "promotion:manage",
  "content:manage",
  "support:manage",
  "user:manage",
  "setting:manage",
  "audit:read",
  "privacy:manage",
]

/** Internal roles: administrator, sales, finance and stock (RF55). */
export const roles: RoleSeed[] = [
  { key: "admin", name: "Administrador", permissions },
  {
    key: "sales",
    name: "Comercial",
    permissions: [
      "product:read",
      "order:read",
      "quote:read",
      "quote:answer",
      "customer:read",
      "customer:update",
      "support:manage",
    ],
  },
  {
    key: "finance",
    name: "Financeiro",
    permissions: [
      "order:read",
      "order:cancel",
      "customer:read",
      "credit:approve",
      "payment:refund",
      "invoice:manage",
      "audit:read",
    ],
  },
  {
    key: "stock",
    name: "Estoque e logística",
    permissions: [
      "product:read",
      "stock:read",
      "stock:update",
      "order:read",
      "order:status:update",
      "shipment:manage",
    ],
  },
]

/** A catalog category. */
export type CategorySeed = {
  /** URL slug. */
  slug: string
  /** Display name. */
  name: string
}

/** Main catalog categories (RF01). */
export const categories: CategorySeed[] = [
  { slug: "papelaria-nobre", name: "Papelaria nobre" },
  { slug: "escrita-fina", name: "Escrita fina" },
  { slug: "organizacao-de-mesa", name: "Organização de mesa" },
  { slug: "iluminacao", name: "Iluminação" },
  { slug: "mobiliario-ergonomico", name: "Mobiliário ergonômico" },
  { slug: "projetos-b2b", name: "Projetos B2B" },
]

/** A product with one or more SKUs and initial stock. */
export type ProductSeed = {
  /** URL slug. */
  slug: string
  /** Category slug. */
  category: string
  /** Display name. */
  name: string
  /** Description. */
  description: string
  /** Brand. */
  brand: string
  /** Base price, as a decimal string. */
  price: string
  /** Weight in kg. */
  weightKg: string
  /** Dimensions in cm: length, width and height. */
  dimensionsCm: [string, string, string]
  /** Contractual warranty in months. */
  warrantyMonths: number
  /** Whether checkout requires an installation date (RN05). */
  requiresInstallation?: boolean
  /** Whether laser engraving is offered (RF51). */
  personalizable?: boolean
  /** Technical specifications. */
  specs: Record<string, string>
  /** SKUs with code, name, attributes and stock on hand. */
  skus: Array<{
    code: string
    name: string
    attributes?: Record<string, string>
    stock: number
  }>
}

/** Fictitious catalog for development and the demo. */
export const products: ProductSeed[] = [
  {
    slug: "caderno-couro-toscano-a5",
    category: "papelaria-nobre",
    name: "Caderno em couro toscano A5",
    description:
      "Caderno com capa em couro legítimo de curtimento vegetal, costura aparente e papel pólen 90 g/m².",
    brand: "Atelier Bureau",
    price: "389.00",
    weightKg: "0.450",
    dimensionsCm: ["23", "17", "3"],
    warrantyMonths: 6,
    personalizable: true,
    specs: { Formato: "A5", Papel: "Pólen 90 g/m²", Folhas: "192" },
    skus: [
      {
        code: "PAP-CAD-A5-CAR",
        name: "Caramelo",
        attributes: { cor: "Caramelo" },
        stock: 40,
      },
      {
        code: "PAP-CAD-A5-GRA",
        name: "Grafite",
        attributes: { cor: "Grafite" },
        stock: 25,
      },
    ],
  },
  {
    slug: "caneta-tinteiro-heritage",
    category: "escrita-fina",
    name: "Caneta tinteiro Heritage",
    description:
      "Caneta tinteiro com corpo em resina e acabamentos em latão, pena de aço banhada a ouro.",
    brand: "Atelier Bureau",
    price: "1290.00",
    weightKg: "0.200",
    dimensionsCm: ["18", "6", "4"],
    warrantyMonths: 12,
    personalizable: true,
    specs: { Pena: "M, aço banhado a ouro", Carga: "Cartucho e conversor" },
    skus: [{ code: "ESC-TIN-HER-M", name: "Pena média", stock: 12 }],
  },
  {
    slug: "organizador-modular-nogueira",
    category: "organizacao-de-mesa",
    name: "Organizador modular em nogueira",
    description:
      "Organizador de mesa em nogueira maciça com detalhes em latão escovado.",
    brand: "Atelier Bureau",
    price: "2480.00",
    weightKg: "2.800",
    dimensionsCm: ["40", "25", "12"],
    warrantyMonths: 12,
    specs: { Madeira: "Nogueira maciça", Acabamento: "Óleo natural" },
    skus: [
      {
        code: "ORG-MOD-NOG",
        name: "Nogueira",
        attributes: { acabamento: "Nogueira" },
        stock: 8,
      },
      {
        code: "ORG-MOD-CAR",
        name: "Carvalho",
        attributes: { acabamento: "Carvalho" },
        stock: 5,
      },
    ],
  },
  {
    slug: "luminaria-articulada-latao",
    category: "iluminacao",
    name: "Luminária articulada em latão",
    description:
      "Luminária de mesa com braço articulado, LED de 3000 K e dimmer.",
    brand: "Atelier Bureau",
    price: "1890.00",
    weightKg: "3.200",
    dimensionsCm: ["55", "20", "20"],
    warrantyMonths: 12,
    specs: { LED: "3000 K, 8 W", Tensão: "Bivolt" },
    skus: [{ code: "ILU-ART-LAT", name: "Latão escovado", stock: 10 }],
  },
  {
    slug: "poltrona-executiva-walnut",
    category: "mobiliario-ergonomico",
    name: "Poltrona executiva em couro",
    description:
      "Poltrona executiva com estrutura em nogueira, couro natural e mecanismo de reclinação sincronizado.",
    brand: "Atelier Bureau",
    price: "7400.00",
    weightKg: "28.000",
    dimensionsCm: ["75", "70", "120"],
    warrantyMonths: 24,
    requiresInstallation: true,
    specs: { Estofado: "Couro natural", "Peso máximo": "130 kg" },
    skus: [{ code: "MOB-POL-EXE-NOG", name: "Nogueira e couro", stock: 4 }],
  },
  {
    slug: "mesa-regulavel-carvalho",
    category: "mobiliario-ergonomico",
    name: "Mesa com regulagem elétrica em carvalho",
    description:
      "Mesa com regulagem elétrica de altura, tampo em carvalho e memória de quatro posições.",
    brand: "Atelier Bureau",
    price: "9800.00",
    weightKg: "62.000",
    dimensionsCm: ["160", "80", "12"],
    warrantyMonths: 36,
    requiresInstallation: true,
    specs: { Altura: "65 a 130 cm", Motor: "Duplo, 120 kg" },
    skus: [{ code: "MOB-MES-REG-CAR", name: "Carvalho 160 × 80", stock: 3 }],
  },
]

/** A fictitious account for development and the demo. */
export type AccountSeed = {
  /** Login e-mail (fictitious domain). */
  email: string
  /** Display name. */
  name: string
  /** PF or PJ. */
  personType: "PF" | "PJ"
  /** Fictitious CPF or CNPJ, digits only. */
  document: string
  /** Internal role keys (back office users only). */
  roles?: string[]
}

/** Test accounts. Passwords come from SEED_PASSWORD (see README). */
export const accounts: AccountSeed[] = [
  {
    email: "admin@atelierbureau.test",
    name: "Administração Atelier Bureau",
    personType: "PF",
    document: "00000000191",
    roles: ["admin"],
  },
  {
    email: "comercial@atelierbureau.test",
    name: "Equipe Comercial",
    personType: "PF",
    document: "00000000272",
    roles: ["sales"],
  },
  {
    email: "cliente.pf@atelierbureau.test",
    name: "Cliente Pessoa Física",
    personType: "PF",
    document: "00000000353",
  },
  {
    email: "solicitante@empresa-ficticia.test",
    name: "Solicitante Empresa Fictícia",
    personType: "PJ",
    document: "00000000434",
  },
  {
    email: "aprovador@empresa-ficticia.test",
    name: "Aprovador Empresa Fictícia",
    personType: "PJ",
    document: "00000000515",
  },
]

/** Fictitious corporate account with a requester and an approver. */
export const corporateAccount = {
  name: "Empresa Fictícia Ltda.",
  slug: "empresa-ficticia",
  cnpj: "98765432000198",
  legalName: "Empresa Fictícia Ltda. (dados fictícios)",
  creditLimit: "50000.00",
  members: [
    { email: "solicitante@empresa-ficticia.test", role: "requester" },
    { email: "aprovador@empresa-ficticia.test", role: "approver,admin" },
  ],
}
