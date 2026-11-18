# Atelier Bureau — MER (modelo lógico)

> Gerado por `npm run db:docs` a partir do banco criado pelas migrations (`prisma/migrations`). Fonte da verdade: [`prisma/schema.prisma`](../../prisma/schema.prisma). Não edite à mão: altere o schema ou `scripts/db-docs/descriptions.ts` e gere de novo.

Notação pé de galinha: `||` exatamente um, `|o` zero ou um, `o{` zero ou muitos e `o|` zero ou um do lado filho (relação 1:1). O rótulo da linha é a coluna de chave estrangeira. Tipos abreviados: `varchar_191` = `VARCHAR(191)`, `decimal_12_2` = `DECIMAL(12,2)` e `datetime_3` = `DATETIME(3)`.

Tabelas de outros domínios aparecem sem atributos, só para mostrar a ligação. O detalhe de cada coluna está no [dicionário de dados](04-dicionario-de-dados.md).

## Acesso, contas e perfis

```mermaid
erDiagram
  users ||--o{ accounts : "user_id"
  organizations |o--o{ addresses : "organization_id"
  users |o--o{ addresses : "user_id"
  users ||--o{ invitations : "inviter_id"
  organizations ||--o{ invitations : "organization_id"
  organizations ||--o{ members : "organization_id"
  users ||--o{ members : "user_id"
  price_tables |o--o{ organizations : "price_table_id"
  users |o--o{ organizations : "seller_id"
  permissions ||--o{ role_permissions : "permission_id"
  roles ||--o{ role_permissions : "role_id"
  users ||--o{ sessions : "user_id"
  users ||--o{ two_factors : "user_id"
  roles ||--o{ user_roles : "role_id"
  users ||--o{ user_roles : "user_id"
  price_tables |o--o{ users : "price_table_id"
  users {
    varchar_36 id PK
    varchar_160 name
    varchar_191 email UK
    tinyint_1 email_verified
    text image
    tinyint_1 two_factor_enabled
    enum person_type
    varchar_80 document UK
    varchar_80 phone
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
    char_36 price_table_id FK
  }
  sessions {
    varchar_36 id PK
    datetime_3 expires_at
    varchar_191 token UK
    datetime_3 created_at
    datetime_3 updated_at
    varchar_64 ip_address
    text user_agent
    varchar_36 user_id FK
    varchar_36 active_organization_id
    tinyint_1 two_factor_verified
  }
  accounts {
    varchar_36 id PK
    varchar_191 account_id
    varchar_64 provider_id
    varchar_36 user_id FK
    text access_token
    text refresh_token
    text id_token
    datetime_3 access_token_expires_at
    datetime_3 refresh_token_expires_at
    text scope
    text password
    datetime_3 created_at
    datetime_3 updated_at
  }
  verifications {
    varchar_36 id PK
    varchar_191 identifier
    text value
    datetime_3 expires_at
    datetime_3 created_at
    datetime_3 updated_at
  }
  two_factors {
    varchar_36 id PK
    varchar_191 secret
    text backup_codes
    varchar_36 user_id FK
    tinyint_1 verified
    int failed_verification_count
    datetime_3 locked_until
  }
  organizations {
    varchar_36 id PK
    varchar_160 name
    varchar_191 slug UK
    text logo
    text metadata
    varchar_14 cnpj UK
    varchar_191 legal_name
    enum credit_status
    decimal_12_2 credit_limit
    varchar_36 seller_id FK
    datetime_3 created_at
    datetime_3 deleted_at
    char_36 price_table_id FK
  }
  members {
    varchar_36 id PK
    varchar_36 organization_id FK
    varchar_36 user_id FK
    varchar_64 role
    datetime_3 created_at
  }
  invitations {
    varchar_36 id PK
    varchar_36 organization_id FK
    varchar_191 email
    varchar_64 role
    varchar_32 status
    datetime_3 expires_at
    datetime_3 created_at
    varchar_36 inviter_id FK
  }
  roles {
    char_36 id PK
    varchar_64 key UK
    varchar_120 name
    datetime_3 created_at
  }
  permissions {
    char_36 id PK
    varchar_64 resource
    varchar_32 action
    varchar_191 description
  }
  role_permissions {
    char_36 role_id PK, FK
    char_36 permission_id PK, FK
  }
  user_roles {
    varchar_36 user_id PK, FK
    char_36 role_id PK, FK
  }
  addresses {
    char_36 id PK
    varchar_36 user_id FK
    varchar_36 organization_id FK
    varchar_80 label
    varchar_160 recipient
    char_8 cep
    varchar_191 street
    varchar_20 number
    varchar_120 complement
    varchar_120 district
    varchar_120 city
    char_2 state
    tinyint_1 is_default
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
  }
```

## Catálogo e estoque

```mermaid
erDiagram
  categories |o--o{ categories : "parent_id"
  products ||--o{ favorites : "product_id"
  users ||--o{ favorites : "user_id"
  products ||--o{ product_documents : "product_id"
  products ||--o{ product_images : "product_id"
  categories ||--o{ products : "category_id"
  products ||--o{ skus : "product_id"
  skus ||--o| stock : "sku_id"
  orders |o--o{ stock_movements : "order_id"
  skus ||--o{ stock_movements : "sku_id"
  users |o--o{ stock_movements : "user_id"
  categories {
    char_36 id PK
    char_36 parent_id FK
    varchar_120 name
    varchar_160 slug UK
    int position
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
  }
  products {
    char_36 id PK
    char_36 category_id FK
    varchar_191 slug UK
    varchar_191 name
    text description
    varchar_120 brand
    json specs
    decimal_12_2 base_price
    decimal_8_3 weight_kg
    decimal_8_2 length_cm
    decimal_8_2 width_cm
    decimal_8_2 height_cm
    int warranty_months
    tinyint_1 includes_extended_warranty
    tinyint_1 requires_certification
    tinyint_1 requires_installation
    tinyint_1 personalizable
    tinyint_1 limited_edition
    varchar_60 lot_number
    int lead_time_days
    enum status
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
  }
  product_images {
    char_36 id PK
    char_36 product_id FK
    varchar_255 storage_key
    varchar_191 alt
    int position
    datetime_3 created_at
  }
  product_documents {
    char_36 id PK
    char_36 product_id FK
    enum kind
    varchar_191 name
    varchar_255 storage_key
    datetime_3 created_at
  }
  skus {
    char_36 id PK
    char_36 product_id FK
    varchar_64 code UK
    varchar_191 name
    json attributes
    decimal_12_2 price
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
  }
  stock {
    char_36 sku_id PK, FK
    int on_hand
    int reserved
    datetime_3 updated_at
  }
  stock_movements {
    char_36 id PK
    char_36 sku_id FK
    enum type
    int quantity
    char_36 order_id FK
    varchar_36 user_id FK
    varchar_255 note
    datetime_3 created_at
  }
  favorites {
    varchar_36 user_id PK, FK
    char_36 product_id PK, FK
    datetime_3 created_at
  }
```

## Carrinho, cotação, preços e promoções

```mermaid
erDiagram
  carts ||--o{ cart_items : "cart_id"
  skus ||--o{ cart_items : "sku_id"
  organizations |o--o{ carts : "organization_id"
  users |o--o{ carts : "user_id"
  price_tables ||--o{ price_table_items : "price_table_id"
  products ||--o{ price_table_items : "product_id"
  categories |o--o{ promotions : "category_id"
  products |o--o{ promotions : "product_id"
  quotes ||--o{ quote_attachments : "quote_id"
  products ||--o{ quote_items : "product_id"
  quotes ||--o{ quote_items : "quote_id"
  skus |o--o{ quote_items : "sku_id"
  users |o--o{ quotes : "answered_by_id"
  organizations |o--o{ quotes : "organization_id"
  users ||--o{ quotes : "user_id"
  categories ||--o{ volume_discounts : "category_id"
  carts {
    char_36 id PK
    enum kind
    varchar_120 name
    varchar_36 user_id FK
    varchar_36 organization_id FK
    varchar_64 guest_token UK
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
    varchar_40 coupon_code
  }
  cart_items {
    char_36 id PK
    char_36 cart_id FK
    char_36 sku_id FK
    int quantity
    json personalization
    json services
    datetime_3 created_at
    datetime_3 updated_at
  }
  quotes {
    char_36 id PK
    varchar_20 number UK
    varchar_36 user_id FK
    varchar_36 organization_id FK
    enum status
    text notes
    datetime_3 valid_until
    decimal_12_2 subtotal
    decimal_12_2 discount
    decimal_12_2 shipping_total
    decimal_12_2 total
    datetime_3 created_at
    datetime_3 updated_at
    text answer_note
    datetime_3 answered_at
    varchar_36 answered_by_id FK
  }
  quote_items {
    char_36 id PK
    char_36 quote_id FK
    char_36 product_id FK
    varchar_255 description
    int quantity
    decimal_12_2 unit_price
    char_36 sku_id FK
  }
  quote_attachments {
    char_36 id PK
    char_36 quote_id FK
    varchar_191 name
    varchar_100 mime_type
    int size_bytes
    varchar_255 storage_key
    datetime_3 created_at
  }
  price_tables {
    char_36 id PK
    varchar_120 name
    varchar_255 description
    decimal_5_2 discount_percent
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
  }
  price_table_items {
    char_36 id PK
    char_36 price_table_id FK
    char_36 product_id FK
    decimal_5_2 discount_percent
    datetime_3 created_at
  }
  volume_discounts {
    char_36 id PK
    char_36 category_id FK
    int min_quantity
    decimal_12_2 min_amount
    decimal_5_2 discount_percent
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
  }
  promotions {
    char_36 id PK
    varchar_120 name
    enum scope
    char_36 product_id FK
    char_36 category_id FK
    varchar_40 coupon_code UK
    enum discount_type
    decimal_12_2 discount_value
    tinyint_1 free_shipping
    decimal_12_2 min_order_total
    datetime_3 starts_at
    datetime_3 ends_at
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
    datetime_3 deleted_at
  }
```

## Pedidos e logística

```mermaid
erDiagram
  users ||--o{ order_approvals : "decided_by_id"
  orders ||--o{ order_approvals : "order_id"
  orders ||--o{ order_items : "order_id"
  skus ||--o{ order_items : "sku_id"
  users |o--o{ order_status_history : "changed_by_id"
  orders ||--o{ order_status_history : "order_id"
  users |o--o{ orders : "approved_by_id"
  organizations |o--o{ orders : "organization_id"
  quotes |o--o{ orders : "quote_id"
  users ||--o{ orders : "user_id"
  orders ||--o| shipments : "order_id"
  orders {
    char_36 id PK
    varchar_20 number UK
    varchar_36 user_id FK
    varchar_36 organization_id FK
    char_36 quote_id FK
    enum status
    enum payment_method
    decimal_12_2 subtotal
    decimal_12_2 discount
    decimal_12_2 services_total
    decimal_12_2 shipping_total
    decimal_12_2 total
    json shipping_address
    datetime_3 scheduled_delivery_at
    tinyint_1 requires_approval
    varchar_36 approved_by_id FK
    datetime_3 approved_at
    text approval_note
    datetime_3 created_at
    datetime_3 updated_at
    int extra_lead_business_days
    json applied_promotions
    varchar_40 coupon_code
  }
  order_items {
    char_36 id PK
    char_36 order_id FK
    char_36 sku_id FK
    varchar_191 product_name
    varchar_64 sku_code
    int quantity
    decimal_12_2 unit_price
    decimal_12_2 total
    json personalization
    json services
  }
  order_status_history {
    char_36 id PK
    char_36 order_id FK
    enum from_status
    enum to_status
    varchar_36 changed_by_id FK
    varchar_255 note
    datetime_3 created_at
  }
  order_approvals {
    char_36 id PK
    char_36 order_id FK
    enum decision
    varchar_36 decided_by_id FK
    text note
    decimal_12_2 order_total
    datetime_3 created_at
  }
  shipments {
    char_36 id PK
    char_36 order_id FK, UK
    enum method
    varchar_120 carrier
    varchar_120 service
    decimal_12_2 price
    int delivery_days
    varchar_64 tracking_code
    json quote_data
    datetime_3 shipped_at
    datetime_3 delivered_at
    datetime_3 created_at
    datetime_3 updated_at
  }
  shipping_regions {
    char_36 id PK
    varchar_120 name
    char_8 cep_start
    char_8 cep_end
    tinyint_1 own_delivery
    json own_delivery_rates
    decimal_12_2 free_shipping_minimum
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
  }
```

## Financeiro e fiscal

```mermaid
erDiagram
  users ||--o{ credit_limit_changes : "changed_by_id"
  organizations ||--o{ credit_limit_changes : "organization_id"
  orders ||--o{ invoiced_installments : "order_id"
  users |o--o{ invoiced_installments : "settled_by_id"
  orders ||--o| invoices : "order_id"
  orders ||--o{ payments : "order_id"
  users |o--o{ refunds : "decided_by_id"
  orders ||--o{ refunds : "order_id"
  payments |o--o{ refunds : "payment_row_id"
  users ||--o{ refunds : "requested_by_id"
  payments {
    char_36 id PK
    char_36 order_id FK
    enum method
    enum status
    varchar_64 payment_id UK
    varchar_64 provider_status
    decimal_12_2 amount
    decimal_12_2 refunded_amount
    int installments
    datetime_3 expires_at
    text pix_qr_code
    text boleto_url
    datetime_3 paid_at
    datetime_3 created_at
    datetime_3 updated_at
    varchar_64 status_detail
    varchar_64 boleto_line
    mediumtext pix_qr_code_image
  }
  payment_notifications {
    char_36 id PK
    varchar_128 request_id UK
    varchar_40 topic
    varchar_64 resource_id
    datetime_3 received_at
    datetime_3 processed_at
    int attempts
  }
  refunds {
    char_36 id PK
    char_36 order_id FK
    char_36 payment_row_id FK
    enum kind
    enum reason
    enum channel
    decimal_12_2 amount
    enum status
    varchar_64 provider_refund_id UK
    varchar_500 note
    varchar_255 failure_reason
    varchar_36 requested_by_id FK
    varchar_36 decided_by_id FK
    datetime_3 decided_at
    varchar_255 decision_note
    datetime_3 completed_at
    datetime_3 created_at
    datetime_3 updated_at
  }
  invoiced_installments {
    char_36 id PK
    char_36 order_id FK
    int sequence
    int due_days
    decimal_12_2 amount
    datetime_3 due_date
    enum status
    varchar_20 boleto_number UK
    varchar_64 digitable_line
    datetime_3 paid_at
    decimal_12_2 paid_amount
    varchar_36 settled_by_id FK
    enum settlement_method
    varchar_255 settlement_note
    datetime_3 created_at
    datetime_3 updated_at
  }
  invoices {
    char_36 id PK
    char_36 order_id FK, UK
    enum status
    char_44 access_key UK
    varchar_20 number
    varchar_5 series
    varchar_64 protocol
    mediumtext xml
    varchar_255 danfe_key
    datetime_3 submitted_at
    int attempts
    varchar_500 last_error
    datetime_3 next_attempt_at
    datetime_3 alerted_at
    datetime_3 issued_at
    datetime_3 created_at
    datetime_3 updated_at
  }
  credit_limit_changes {
    char_36 id PK
    varchar_36 organization_id FK
    decimal_12_2 previous_limit
    decimal_12_2 new_limit
    enum status
    varchar_36 changed_by_id FK
    varchar_255 note
    datetime_3 created_at
    enum previous_status
  }
```

## Pós-venda e atendimento

```mermaid
erDiagram
  organizations |o--o{ demo_requests : "organization_id"
  products |o--o{ demo_requests : "product_id"
  users |o--o{ demo_requests : "seller_id"
  users ||--o{ demo_requests : "user_id"
  users ||--o{ seller_rules : "seller_id"
  support_tickets ||--o{ support_ticket_attachments : "ticket_id"
  users |o--o{ support_ticket_events : "author_id"
  support_tickets ||--o{ support_ticket_events : "ticket_id"
  orders ||--o{ support_tickets : "order_id"
  order_items ||--o{ support_tickets : "order_item_id"
  organizations |o--o{ support_tickets : "organization_id"
  users ||--o{ support_tickets : "user_id"
  support_tickets {
    char_36 id PK
    varchar_20 number UK
    enum kind
    enum status
    varchar_36 user_id FK
    varchar_36 organization_id FK
    char_36 order_id FK
    char_36 order_item_id FK
    varchar_160 subject
    text description
    text resolution
    datetime_3 closed_at
    datetime_3 created_at
    datetime_3 updated_at
    tinyint_1 legal_review
    tinyint_1 personalized
    enum return_outcome
    enum return_reason
  }
  support_ticket_events {
    char_36 id PK
    char_36 ticket_id FK
    enum from_status
    enum to_status
    text message
    varchar_36 author_id FK
    tinyint_1 from_team
    datetime_3 created_at
  }
  support_ticket_attachments {
    char_36 id PK
    char_36 ticket_id FK
    varchar_191 name
    varchar_100 mime_type
    int size_bytes
    varchar_255 storage_key
    tinyint_1 from_team
    datetime_3 created_at
  }
  seller_rules {
    char_36 id PK
    varchar_36 seller_id FK
    enum person_type
    char_2 state
    tinyint_1 active
    datetime_3 created_at
    datetime_3 updated_at
  }
  demo_requests {
    char_36 id PK
    varchar_36 user_id FK
    varchar_36 organization_id FK
    char_36 product_id FK
    varchar_36 seller_id FK
    enum mode
    datetime_3 scheduled_at
    enum status
    varchar_80 phone
    text notes
    text team_note
    datetime_3 created_at
    datetime_3 updated_at
  }
```

## Plataforma e auditoria

```mermaid
erDiagram
  users |o--o{ audit_logs : "user_id"
  users |o--o{ institutional_pages : "updated_by_id"
  users |o--o{ settings : "updated_by_id"
  settings {
    varchar_100 key PK
    json value
    varchar_255 description
    varchar_36 updated_by_id FK
    datetime_3 updated_at
  }
  institutional_pages {
    varchar_80 slug PK
    varchar_120 title
    mediumtext body
    varchar_36 updated_by_id FK
    datetime_3 created_at
    datetime_3 updated_at
  }
  audit_logs {
    char_36 id PK
    varchar_36 user_id FK
    varchar_100 action
    varchar_64 entity
    varchar_36 entity_id
    json before
    json after
    varchar_64 ip_address
    datetime_3 created_at
  }
  email_outbox {
    char_36 id PK
    varchar_64 template
    varchar_191 recipient
    varchar_255 subject
    text text
    mediumtext html
    enum status
    int attempts
    datetime_3 next_attempt_at
    varchar_120 last_error
    datetime_3 sent_at
    datetime_3 created_at
    datetime_3 updated_at
  }
  rate_limit_buckets {
    char_64 key_hash PK
    datetime_3 window_start PK
    varchar_32 scope
    int hits
    datetime_3 expires_at
  }
```

