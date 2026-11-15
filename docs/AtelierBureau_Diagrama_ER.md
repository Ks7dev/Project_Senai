# Atelier Bureau — Diagrama ER

Modelo de dados da issue #8 (RNF16). A fonte da verdade é o [`prisma/schema.prisma`](../prisma/schema.prisma). Este diagrama mostra as entidades e os relacionamentos principais; colunas de auditoria (`created_at`, `updated_at`, `deleted_at`) foram omitidas.

Convenções: tabelas e colunas em inglês e `snake_case`, dinheiro em `DECIMAL(12,2)`, datas em `DATETIME(3)` (UTC), charset `utf8mb4` com collation `utf8mb4_0900_ai_ci`, e `id` em UUID v7 nas entidades expostas em URL (pedido, cotação).

```mermaid
erDiagram
  users ||--o{ sessions : "tem"
  users ||--o{ accounts : "credenciais"
  users ||--o{ two_factors : "2FA"
  users ||--o{ members : "participa"
  organizations ||--o{ members : "usuários"
  organizations ||--o{ invitations : "convites"
  users |o--o{ organizations : "vendedor dedicado"
  organizations ||--o{ credit_limit_changes : "histórico de crédito"

  roles ||--o{ role_permissions : ""
  permissions ||--o{ role_permissions : ""
  users ||--o{ user_roles : "perfis internos"
  roles ||--o{ user_roles : ""

  users |o--o{ addresses : "endereços PF"
  organizations |o--o{ addresses : "matriz, filiais e obras"

  categories |o--o{ categories : "subcategorias"
  categories ||--o{ products : ""
  products ||--o{ product_images : ""
  products ||--o{ product_documents : "ficha técnica e certificações"
  products ||--o{ skus : "variações"
  skus ||--|| stock : "disponível = on_hand - reserved"
  skus ||--o{ stock_movements : "reserva, baixa e reposição"
  users ||--o{ favorites : ""
  products ||--o{ favorites : ""

  users ||--o{ carts : "carrinho e listas de projeto"
  carts ||--o{ cart_items : ""
  skus ||--o{ cart_items : ""

  users ||--o{ quotes : "solicita"
  organizations |o--o{ quotes : ""
  quotes ||--o{ quote_items : ""
  quotes ||--o{ quote_attachments : "anexos"
  quotes |o--o{ orders : "convertida em"

  users ||--o{ orders : "cliente"
  organizations |o--o{ orders : ""
  orders ||--o{ order_items : ""
  skus ||--o{ order_items : ""
  orders ||--o{ order_status_history : "linha do tempo"
  orders ||--o{ order_approvals : "aprovação ou recusa (RN01)"
  users ||--o{ order_approvals : "aprovador"
  orders ||--o{ payments : "payment_id único"
  orders ||--o| shipments : "frete e rastreio"
  orders |o--o{ stock_movements : ""

  users |o--o{ audit_logs : "ações sensíveis"
  users |o--o{ settings : "alterou"

  users {
    varchar id PK
    varchar email UK
    enum person_type "PF ou PJ"
    varchar document UK "CPF ou CNPJ"
  }
  organizations {
    varchar id PK
    varchar cnpj UK
    enum credit_status
    decimal credit_limit
    varchar seller_id FK
  }
  products {
    char id PK
    varchar slug UK
    decimal base_price
    decimal weight_kg
    enum status "DRAFT, ACTIVE, INACTIVE"
  }
  skus {
    char id PK
    varchar code UK
    decimal price
  }
  orders {
    char id PK "UUID v7"
    varchar number UK
    enum status
    enum payment_method
    decimal total
    json shipping_address "snapshot"
  }
  payments {
    char id PK
    varchar payment_id UK "Mercado Pago"
    enum status
    decimal amount
  }
  quotes {
    char id PK "UUID v7"
    varchar number UK
    enum status
    datetime valid_until "15 dias (RN02)"
  }
  settings {
    varchar key PK
    json value "valores das RN"
  }
  shipping_regions {
    char id PK
    char cep_start
    char cep_end
    boolean own_delivery "RN16"
    decimal free_shipping_minimum "RN23"
  }
```

## Tabelas

| Grupo | Tabelas | Requisitos |
|---|---|---|
| Autenticação (Better Auth) | `users`, `sessions`, `accounts`, `verifications`, `two_factors` | RF39, RF40 |
| Contas corporativas | `organizations`, `members`, `invitations`, `credit_limit_changes` | RF09, RF10, RF58, RN08, RN10, RN11 |
| Perfis internos (RBAC) | `roles`, `permissions`, `role_permissions`, `user_roles` | RF55 |
| Endereços | `addresses` | RF26 |
| Catálogo | `categories`, `products`, `product_images`, `product_documents`, `skus`, `favorites` | RF01–RF03, RF41, RF42, RF45, RN09 |
| Estoque | `stock`, `stock_movements` | RF43, RF44, RN14 |
| Carrinho e cotação | `carts`, `cart_items`, `quotes`, `quote_items`, `quote_attachments` | RF05–RF08, RF20, RF51, RF52, RN02 |
| Pedido, pagamento e frete | `orders`, `order_items`, `order_status_history`, `payments`, `shipments`, `shipping_regions` | RF11, RF15, RF25–RF33, RF54, RN01, RN13, RN15, RN16, RN20, RN23 |
| Configuração e auditoria | `settings`, `audit_logs` | RN01, RN06, RN14, RN16, RN20, RNF12 |
