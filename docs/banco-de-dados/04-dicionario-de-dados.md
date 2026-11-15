# Atelier Bureau — Dicionário de dados

> Gerado por `npm run db:docs` a partir do banco criado pelas migrations (`prisma/migrations`). Fonte da verdade: [`prisma/schema.prisma`](../../prisma/schema.prisma). Não edite à mão: altere o schema ou `scripts/db-docs/descriptions.ts` e gere de novo.

Banco **MySQL 8** (InnoDB), charset `utf8mb4` e collation `utf8mb4_0900_ai_ci` em todas as tabelas. Datas em UTC (`DATETIME(3)`) e dinheiro em `DECIMAL(12,2)`. Chaves: **PK** primária, **FK** estrangeira e **UK** única. A coluna "Nulo" diz se o campo aceita `NULL`.

Totais: 51 tabelas, 498 colunas, 79 chaves estrangeiras, 174 índices (contando as chaves primárias) e 20 gatilhos.

## Sumário

- **Acesso, contas e perfis:** [`users`](#users), [`sessions`](#sessions), [`accounts`](#accounts), [`verifications`](#verifications), [`two_factors`](#two_factors), [`organizations`](#organizations), [`members`](#members), [`invitations`](#invitations), [`roles`](#roles), [`permissions`](#permissions), [`role_permissions`](#role_permissions), [`user_roles`](#user_roles), [`addresses`](#addresses)
- **Catálogo e estoque:** [`categories`](#categories), [`products`](#products), [`product_images`](#product_images), [`product_documents`](#product_documents), [`skus`](#skus), [`stock`](#stock), [`stock_movements`](#stock_movements), [`favorites`](#favorites)
- **Carrinho, cotação, preços e promoções:** [`carts`](#carts), [`cart_items`](#cart_items), [`quotes`](#quotes), [`quote_items`](#quote_items), [`quote_attachments`](#quote_attachments), [`price_tables`](#price_tables), [`price_table_items`](#price_table_items), [`volume_discounts`](#volume_discounts), [`promotions`](#promotions)
- **Pedidos e logística:** [`orders`](#orders), [`order_items`](#order_items), [`order_status_history`](#order_status_history), [`order_approvals`](#order_approvals), [`shipments`](#shipments), [`shipping_regions`](#shipping_regions)
- **Financeiro e fiscal:** [`payments`](#payments), [`payment_notifications`](#payment_notifications), [`refunds`](#refunds), [`invoiced_installments`](#invoiced_installments), [`invoices`](#invoices), [`credit_limit_changes`](#credit_limit_changes)
- **Pós-venda e atendimento:** [`support_tickets`](#support_tickets), [`support_ticket_events`](#support_ticket_events), [`support_ticket_attachments`](#support_ticket_attachments), [`seller_rules`](#seller_rules), [`demo_requests`](#demo_requests)
- **Plataforma e auditoria:** [`settings`](#settings), [`institutional_pages`](#institutional_pages), [`audit_logs`](#audit_logs), [`email_outbox`](#email_outbox)

## Acesso, contas e perfis

### users

**Entidade:** Usuário. Pessoa com login na loja: cliente PF, membro de conta corporativa ou usuário interno (RF39, RF55).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador do usuário (gerado pelo Better Auth) |
| `name` | VARCHAR(160) | Não | — | — | Nome completo |
| `email` | VARCHAR(191) | Não | — | UK | E-mail (único) |
| `email_verified` | BOOLEAN | Não | `false` | — | Indica se o e-mail foi confirmado |
| `image` | TEXT | Sim | NULL | — | URL do avatar |
| `two_factor_enabled` | BOOLEAN | Sim | `false` | — | Indica se o 2FA está ligado |
| `person_type` | ENUM | Não | — | — | Tipo de pessoa: PF ou PJ. Valores: `PF`, `PJ` |
| `document` | VARCHAR(14) | Não | — | UK | CPF (PF) ou CNPJ (PJ), só dígitos (único) |
| `phone` | VARCHAR(20) | Sim | NULL | — | Telefone de contato |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |
| `price_table_id` | CHAR(36) | Sim | NULL | FK | Tabela de preço do cliente PF; membros de conta usam a tabela da conta (RF21). Referencia `price_tables.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `users_document_key` | UNIQUE | `document` |
| `users_email_key` | UNIQUE | `email` |
| `users_price_table_id_idx` | INDEX | `price_table_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `price_table_id` | `price_tables.id` | SET NULL | CASCADE |

### sessions

**Entidade:** Sessão. Sessão de login ativa (Better Auth), com IP e navegador.

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador da sessão |
| `expires_at` | DATETIME(3) | Não | — | — | Data e hora de expiração (UTC) |
| `token` | VARCHAR(191) | Não | — | UK | Token opaco (único) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `ip_address` | VARCHAR(64) | Sim | NULL | — | Endereço IP de origem |
| `user_agent` | TEXT | Sim | NULL | — | Navegador de origem |
| `user_id` | VARCHAR(36) | Não | — | FK | Usuário da sessão. Referencia `users.id` |
| `active_organization_id` | VARCHAR(36) | Sim | NULL | — | Conta corporativa ativa na sessão |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `sessions_token_key` | UNIQUE | `token` |
| `sessions_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `user_id` | `users.id` | CASCADE | CASCADE |

### accounts

**Entidade:** Credencial. Credencial de login do usuário; guarda o hash da senha (RF40).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador da credencial |
| `account_id` | VARCHAR(191) | Não | — | — | Identificador da conta no provedor |
| `provider_id` | VARCHAR(64) | Não | — | — | Provedor de login (credential = e-mail e senha) |
| `user_id` | VARCHAR(36) | Não | — | FK | Usuário dono da credencial. Referencia `users.id` |
| `access_token` | TEXT | Sim | NULL | — | Token de acesso do provedor externo (não usado no login por senha) |
| `refresh_token` | TEXT | Sim | NULL | — | Token de renovação do provedor externo |
| `id_token` | TEXT | Sim | NULL | — | Token de identidade do provedor externo |
| `access_token_expires_at` | DATETIME(3) | Sim | NULL | — | Expiração do token de acesso |
| `refresh_token_expires_at` | DATETIME(3) | Sim | NULL | — | Expiração do token de renovação |
| `scope` | TEXT | Sim | NULL | — | Escopos concedidos pelo provedor |
| `password` | TEXT | Sim | NULL | — | Hash da senha (nunca a senha em texto) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `accounts_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `user_id` | `users.id` | CASCADE | CASCADE |

### verifications

**Entidade:** Verificação. Token temporário de verificação de e-mail e de redefinição de senha (RF40).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador da verificação |
| `identifier` | VARCHAR(191) | Não | — | — | A quem a verificação se refere (e-mail ou finalidade) |
| `value` | TEXT | Não | — | — | Valor do token de verificação |
| `expires_at` | DATETIME(3) | Não | — | — | Data e hora de expiração (UTC) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `verifications_identifier_idx` | INDEX | `identifier` |

### two_factors

**Entidade:** Segundo fator. Segredo TOTP e códigos de recuperação do 2FA (RF40).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador do registro de 2FA |
| `secret` | VARCHAR(191) | Não | — | — | Segredo TOTP (criptografado pelo Better Auth) |
| `backup_codes` | TEXT | Não | — | — | Códigos de recuperação (criptografados) |
| `user_id` | VARCHAR(36) | Não | — | FK | Usuário do 2FA. Referencia `users.id` |
| `verified` | BOOLEAN | Sim | `true` | — | Indica se o 2FA foi confirmado com um código |
| `failed_verification_count` | INT | Sim | `0` | — | Tentativas de código erradas seguidas |
| `locked_until` | DATETIME(3) | Sim | NULL | — | Bloqueio temporário após tentativas erradas |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `two_factors_secret_idx` | INDEX | `secret` |
| `two_factors_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `user_id` | `users.id` | CASCADE | CASCADE |

### organizations

**Entidade:** Conta corporativa. Empresa cliente (CNPJ) com vários usuários, crédito e vendedor dedicado (RF09, RF58, RN11).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador da conta corporativa |
| `name` | VARCHAR(160) | Não | — | — | Nome fantasia |
| `slug` | VARCHAR(191) | Não | — | UK | Identificador amigável usado na URL (único) |
| `logo` | TEXT | Sim | NULL | — | URL do logotipo |
| `metadata` | TEXT | Sim | NULL | — | Metadados do Better Auth (texto JSON) |
| `cnpj` | VARCHAR(14) | Sim | NULL | UK | CNPJ, só dígitos (único) |
| `legal_name` | VARCHAR(191) | Sim | NULL | — | Razão social |
| `credit_status` | ENUM | Não | `NONE` | — | Situação do crédito para compra faturada (RF58). Valores: `NONE`, `PENDING`, `APPROVED`, `REJECTED` |
| `credit_limit` | DECIMAL(12,2) | Sim | NULL | — | Limite de crédito para pedidos faturados (R$) (RN10) |
| `seller_id` | VARCHAR(36) | Sim | NULL | FK | Vendedor dedicado por região ou segmento (RN11). Referencia `users.id` |
| `created_at` | DATETIME(3) | Não | — | — | Data e hora de criação (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |
| `price_table_id` | CHAR(36) | Sim | NULL | FK | Tabela de preço da conta corporativa (RF21). Referencia `price_tables.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `organizations_cnpj_key` | UNIQUE | `cnpj` |
| `organizations_credit_status_idx` | INDEX | `credit_status` |
| `organizations_price_table_id_idx` | INDEX | `price_table_id` |
| `organizations_seller_id_idx` | INDEX | `seller_id` |
| `organizations_slug_key` | UNIQUE | `slug` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `price_table_id` | `price_tables.id` | SET NULL | CASCADE |
| `seller_id` | `users.id` | SET NULL | CASCADE |

### members

**Entidade:** Membro. Vínculo de um usuário com uma conta corporativa e o seu perfil na conta (RF10, RN08).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador do vínculo |
| `organization_id` | VARCHAR(36) | Não | — | FK | Conta corporativa. Referencia `organizations.id` |
| `user_id` | VARCHAR(36) | Não | — | FK | Usuário membro. Referencia `users.id` |
| `role` | VARCHAR(64) | Não | — | — | Perfil na conta: solicitante, aprovador, financeiro ou administrador (RF10) |
| `created_at` | DATETIME(3) | Não | — | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `members_organization_id_user_id_key` | UNIQUE | `organization_id`, `user_id` |
| `members_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `organization_id` | `organizations.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | CASCADE | CASCADE |

### invitations

**Entidade:** Convite. Convite por e-mail para entrar numa conta corporativa (RF09).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | VARCHAR(36) | Não | — | PK | Identificador do convite |
| `organization_id` | VARCHAR(36) | Não | — | FK | Conta corporativa que convida. Referencia `organizations.id` |
| `email` | VARCHAR(191) | Não | — | — | E-mail convidado |
| `role` | VARCHAR(64) | Sim | NULL | — | Perfil oferecido na conta |
| `status` | VARCHAR(32) | Não | — | — | Situação do convite (pendente, aceito, recusado, cancelado) |
| `expires_at` | DATETIME(3) | Não | — | — | Data e hora de expiração (UTC) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `inviter_id` | VARCHAR(36) | Não | — | FK | Usuário que enviou o convite. Referencia `users.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `invitations_email_idx` | INDEX | `email` |
| `invitations_inviter_id_fkey` | INDEX | `inviter_id` |
| `invitations_organization_id_idx` | INDEX | `organization_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `inviter_id` | `users.id` | CASCADE | CASCADE |
| `organization_id` | `organizations.id` | CASCADE | CASCADE |

### roles

**Entidade:** Perfil interno. Perfil de acesso do back office: administrador, comercial, financeiro, estoque (RF55).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `key` | VARCHAR(64) | Não | — | UK | Chave estável em inglês, como admin ou sales (única) |
| `name` | VARCHAR(120) | Não | — | — | Nome exibido do perfil |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `roles_key_key` | UNIQUE | `key` |

### permissions

**Entidade:** Permissão. Permissão no formato recurso:ação, verificada no servidor por requirePermission() (RNF05).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `resource` | VARCHAR(64) | Não | — | — | Recurso, como product ou order:status |
| `action` | VARCHAR(32) | Não | — | — | Ação, como read, create, update, delete ou approve |
| `description` | VARCHAR(191) | Sim | NULL | — | Explicação da permissão |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `permissions_resource_action_key` | UNIQUE | `resource`, `action` |

### role_permissions

**Entidade:** Permissão do perfil. Associação N:N entre perfis internos e permissões.

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `role_id` | CHAR(36) | Não | — | PK, FK | Perfil interno. Referencia `roles.id` |
| `permission_id` | CHAR(36) | Não | — | PK, FK | Permissão concedida. Referencia `permissions.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `role_permissions_permission_id_idx` | INDEX | `permission_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `permission_id` | `permissions.id` | CASCADE | CASCADE |
| `role_id` | `roles.id` | CASCADE | CASCADE |

### user_roles

**Entidade:** Perfil do usuário. Associação N:N entre usuários e perfis internos (RF55).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `user_id` | VARCHAR(36) | Não | — | PK, FK | Usuário interno. Referencia `users.id` |
| `role_id` | CHAR(36) | Não | — | PK, FK | Perfil atribuído. Referencia `roles.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `user_roles_role_id_idx` | INDEX | `role_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `role_id` | `roles.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | CASCADE | CASCADE |

### addresses

**Entidade:** Endereço. Endereço de entrega do cliente PF ou da conta corporativa (matriz, filial, obra) (RF22, RF26).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `user_id` | VARCHAR(36) | Sim | NULL | FK | Cliente PF dono do endereço. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa dona do endereço. Referencia `organizations.id` |
| `label` | VARCHAR(80) | Não | — | — | Apelido: casa, matriz, filial, obra |
| `recipient` | VARCHAR(160) | Não | — | — | Nome de quem recebe |
| `cep` | CHAR(8) | Não | — | — | CEP, 8 dígitos (RF24) |
| `street` | VARCHAR(191) | Não | — | — | Logradouro |
| `number` | VARCHAR(20) | Não | — | — | Número |
| `complement` | VARCHAR(120) | Sim | NULL | — | Complemento |
| `district` | VARCHAR(120) | Não | — | — | Bairro |
| `city` | VARCHAR(120) | Não | — | — | Cidade |
| `state` | CHAR(2) | Não | — | — | UF |
| `is_default` | BOOLEAN | Não | `false` | — | Endereço padrão do dono |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `addresses_cep_idx` | INDEX | `cep` |
| `addresses_organization_id_idx` | INDEX | `organization_id` |
| `addresses_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `organization_id` | `organizations.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | CASCADE | CASCADE |

## Catálogo e estoque

### categories

**Entidade:** Categoria. Categoria e subcategoria do catálogo, em árvore (RF01).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `parent_id` | CHAR(36) | Sim | NULL | FK | Categoria pai; nulo na raiz (subcategorias, RF01). Referencia `categories.id` |
| `name` | VARCHAR(120) | Não | — | — | Nome |
| `slug` | VARCHAR(160) | Não | — | UK | Identificador amigável usado na URL (único) |
| `position` | INT | Não | `0` | — | Ordem de exibição |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `categories_parent_id_position_idx` | INDEX | `parent_id`, `position` |
| `categories_slug_key` | UNIQUE | `slug` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `parent_id` | `categories.id` | RESTRICT | CASCADE |

### products

**Entidade:** Produto. Produto do catálogo com especificações, preço base, dimensões e regras de publicação (RF41, RF42).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `category_id` | CHAR(36) | Não | — | FK | Categoria do produto. Referencia `categories.id` |
| `slug` | VARCHAR(191) | Não | — | UK | Identificador amigável usado na URL (único) |
| `name` | VARCHAR(191) | Não | — | — | Nome do produto |
| `description` | TEXT | Não | — | — | Descrição longa |
| `brand` | VARCHAR(120) | Sim | NULL | — | Marca |
| `specs` | JSON | Sim | NULL | — | Especificações técnicas em pares chave/valor (RF03) |
| `base_price` | DECIMAL(12,2) | Não | — | — | Preço base (R$); o SKU pode sobrescrever |
| `weight_kg` | DECIMAL(8,3) | Não | — | — | Peso em kg, usado no frete (RN20) |
| `length_cm` | DECIMAL(8,2) | Não | — | — | Comprimento em cm |
| `width_cm` | DECIMAL(8,2) | Não | — | — | Largura em cm |
| `height_cm` | DECIMAL(8,2) | Não | — | — | Altura em cm |
| `warranty_months` | INT | Não | `3` | — | Garantia em meses |
| `includes_extended_warranty` | BOOLEAN | Não | `false` | — | Garantia estendida incluída, definida acima do valor configurado (RN06) |
| `requires_certification` | BOOLEAN | Não | `false` | — | Exige documento de certificação para publicar (RN09) |
| `requires_installation` | BOOLEAN | Não | `false` | — | Exige agendamento de entrega e instalação (RN05) |
| `personalizable` | BOOLEAN | Não | `false` | — | Aceita personalização (RF51) |
| `limited_edition` | BOOLEAN | Não | `false` | — | Edição limitada |
| `lot_number` | VARCHAR(60) | Sim | NULL | — | Número do lote da edição limitada |
| `lead_time_days` | INT | Não | `5` | — | Prazo de produção ou separação em dias |
| `status` | ENUM | Não | `DRAFT` | — | Rascunho, publicado ou inativo (RF42). Valores: `DRAFT`, `ACTIVE`, `INACTIVE` |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `products_brand_idx` | INDEX | `brand` |
| `products_category_id_status_idx` | INDEX | `category_id`, `status` |
| `products_name_description_idx` | FULLTEXT | `name`, `description` |
| `products_slug_key` | UNIQUE | `slug` |
| `products_status_base_price_idx` | INDEX | `status`, `base_price` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `category_id` | `categories.id` | RESTRICT | CASCADE |

### product_images

**Entidade:** Imagem do produto. Imagem WebP do produto, com texto alternativo (RF41, RNF04).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `product_id` | CHAR(36) | Não | — | FK | Produto vinculado. Referencia `products.id` |
| `storage_key` | VARCHAR(255) | Não | — | — | Chave do arquivo no armazenamento (S3 compatível; disco local em dev) |
| `alt` | VARCHAR(191) | Não | — | — | Texto alternativo da imagem (RNF13) |
| `position` | INT | Não | `0` | — | Ordem de exibição |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `product_images_product_id_position_idx` | INDEX | `product_id`, `position` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `product_id` | `products.id` | CASCADE | CASCADE |

### product_documents

**Entidade:** Documento do produto. PDF de manual, ficha técnica ou certificação (RF03, RN09).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `product_id` | CHAR(36) | Não | — | FK | Produto vinculado. Referencia `products.id` |
| `kind` | ENUM | Não | — | — | Manual, ficha técnica ou certificação. Valores: `DATASHEET`, `CERTIFICATION`, `MANUAL` |
| `name` | VARCHAR(191) | Não | — | — | Nome exibido do documento |
| `storage_key` | VARCHAR(255) | Não | — | — | Chave do arquivo no armazenamento (S3 compatível; disco local em dev) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `product_documents_product_id_kind_idx` | INDEX | `product_id`, `kind` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `product_id` | `products.id` | CASCADE | CASCADE |

### skus

**Entidade:** SKU. Variação vendável do produto (acabamento, cor, tamanho), com código único (RF43).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `product_id` | CHAR(36) | Não | — | FK | Produto vinculado. Referencia `products.id` |
| `code` | VARCHAR(64) | Não | — | UK | Código do SKU (único) |
| `name` | VARCHAR(191) | Não | — | — | Nome da variação |
| `attributes` | JSON | Sim | NULL | — | Atributos da variação, como acabamento |
| `price` | DECIMAL(12,2) | Sim | NULL | — | Preço da variação (R$); nulo usa o preço base do produto |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `skus_code_key` | UNIQUE | `code` |
| `skus_product_id_idx` | INDEX | `product_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `product_id` | `products.id` | CASCADE | CASCADE |

### stock

**Entidade:** Estoque. Saldo físico e reservado por SKU; disponível = on_hand - reserved (RF43, RN14).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `sku_id` | CHAR(36) | Não | — | PK, FK | SKU do saldo (chave primária). Referencia `skus.id` |
| `on_hand` | INT | Não | `0` | — | Unidades físicas no estoque (nunca negativo) |
| `reserved` | INT | Não | `0` | — | Unidades reservadas por pedidos em aberto (nunca negativo) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `sku_id` | `skus.id` | CASCADE | CASCADE |

**Gatilhos:** `trg_stock_before_insert` (BEFORE INSERT), `trg_stock_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### stock_movements

**Entidade:** Movimento de estoque. Razão das entradas, reservas, baixas e liberações de estoque (RF43).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `sku_id` | CHAR(36) | Não | — | FK | SKU vinculado. Referencia `skus.id` |
| `type` | ENUM | Não | — | — | Entrada, reserva, baixa, liberação ou ajuste. Valores: `RESERVE`, `RELEASE`, `WRITE_OFF`, `RESTOCK`, `ADJUSTMENT` |
| `quantity` | INT | Não | — | — | Unidades movimentadas |
| `order_id` | CHAR(36) | Sim | NULL | FK | Pedido que gerou o movimento. Referencia `orders.id` |
| `user_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que lançou o movimento manual. Referencia `users.id` |
| `note` | VARCHAR(255) | Sim | NULL | — | Observação livre |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `stock_movements_order_id_idx` | INDEX | `order_id` |
| `stock_movements_sku_id_created_at_idx` | INDEX | `sku_id`, `created_at` |
| `stock_movements_user_id_fkey` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | SET NULL | CASCADE |
| `sku_id` | `skus.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | SET NULL | CASCADE |

**Gatilhos:** `trg_stock_movements_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### favorites

**Entidade:** Favorito. Produto salvo na lista de favoritos do cliente (RF45).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `user_id` | VARCHAR(36) | Não | — | PK, FK | Cliente. Referencia `users.id` |
| `product_id` | CHAR(36) | Não | — | PK, FK | Produto favoritado. Referencia `products.id` |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `favorites_product_id_idx` | INDEX | `product_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `product_id` | `products.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | CASCADE | CASCADE |

## Carrinho, cotação, preços e promoções

### carts

**Entidade:** Carrinho. Carrinho de compras ou lista de projeto salva (RF07).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `kind` | ENUM | Não | `CART` | — | Carrinho ativo ou lista de projeto (RF07). Valores: `CART`, `PROJECT_LIST` |
| `name` | VARCHAR(120) | Sim | NULL | — | Nome da lista de projeto |
| `user_id` | VARCHAR(36) | Sim | NULL | FK | Cliente logado dono do carrinho. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa da lista compartilhada. Referencia `organizations.id` |
| `guest_token` | VARCHAR(64) | Sim | NULL | UK | Identificador do carrinho anônimo guardado em cookie (único) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |
| `coupon_code` | VARCHAR(40) | Sim | NULL | — | Cupom digitado, conferido de novo a cada cálculo (RF46) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `carts_guest_token_key` | UNIQUE | `guest_token` |
| `carts_organization_id_fkey` | INDEX | `organization_id` |
| `carts_user_id_kind_idx` | INDEX | `user_id`, `kind` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `organization_id` | `organizations.id` | CASCADE | CASCADE |
| `user_id` | `users.id` | CASCADE | CASCADE |

### cart_items

**Entidade:** Item do carrinho. SKU no carrinho, com personalização e serviços adicionais (RF51, RF52).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `cart_id` | CHAR(36) | Não | — | FK | Carrinho. Referencia `carts.id` |
| `sku_id` | CHAR(36) | Não | — | FK | SKU vinculado. Referencia `skus.id` |
| `quantity` | INT | Não | — | — | Quantidade |
| `personalization` | JSON | Sim | NULL | — | Personalização escolhida (texto da gravação e opções) (RF51) |
| `services` | JSON | Sim | NULL | — | Serviços adicionais escolhidos (embalagem, montagem) (RF52) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `cart_items_cart_id_sku_id_key` | UNIQUE | `cart_id`, `sku_id` |
| `cart_items_sku_id_idx` | INDEX | `sku_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `cart_id` | `carts.id` | CASCADE | CASCADE |
| `sku_id` | `skus.id` | RESTRICT | CASCADE |

### quotes

**Entidade:** Cotação. Pedido formal de orçamento, com número rastreável e validade (RF05, RF06, RN02).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `number` | VARCHAR(20) | Não | — | UK | Número rastreável, como COT-2026-000123 (RF06) |
| `user_id` | VARCHAR(36) | Não | — | FK | Cliente que pediu a cotação. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa vinculada; nulo para cliente PF. Referencia `organizations.id` |
| `status` | ENUM | Não | `REQUESTED` | — | Situação atual (ver enumeração). Valores: `REQUESTED`, `IN_REVIEW`, `ANSWERED`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED` |
| `notes` | TEXT | Sim | NULL | — | Observações do cliente |
| `valid_until` | DATETIME(3) | Sim | NULL | — | Fim da validade da cotação (RN02) |
| `subtotal` | DECIMAL(12,2) | Não | `0.00` | — | Soma dos itens antes de descontos e frete (R$) |
| `discount` | DECIMAL(12,2) | Não | `0.00` | — | Desconto concedido (R$) |
| `shipping_total` | DECIMAL(12,2) | Não | `0.00` | — | Valor do frete (R$) |
| `total` | DECIMAL(12,2) | Não | `0.00` | — | Valor total em reais (R$) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `answer_note` | TEXT | Sim | NULL | — | Resposta do comercial ao cliente (RF20) |
| `answered_at` | DATETIME(3) | Sim | NULL | — | Data e hora da resposta |
| `answered_by_id` | VARCHAR(36) | Sim | NULL | FK | Vendedor que respondeu. Referencia `users.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `quotes_answered_by_id_idx` | INDEX | `answered_by_id` |
| `quotes_number_key` | UNIQUE | `number` |
| `quotes_organization_id_idx` | INDEX | `organization_id` |
| `quotes_status_valid_until_idx` | INDEX | `status`, `valid_until` |
| `quotes_user_id_idx` | INDEX | `user_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `answered_by_id` | `users.id` | SET NULL | CASCADE |
| `organization_id` | `organizations.id` | RESTRICT | CASCADE |
| `user_id` | `users.id` | RESTRICT | CASCADE |

### quote_items

**Entidade:** Item da cotação. Produto ou SKU cotado, com o preço negociado (RF05, RF20).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `quote_id` | CHAR(36) | Não | — | FK | Cotação vinculada. Referencia `quotes.id` |
| `product_id` | CHAR(36) | Não | — | FK | Produto vinculado. Referencia `products.id` |
| `description` | VARCHAR(255) | Não | — | — | Descrição livre do item pedido |
| `quantity` | INT | Não | — | — | Quantidade |
| `unit_price` | DECIMAL(12,2) | Sim | NULL | — | Preço de catálogo no pedido; preço negociado após a resposta |
| `sku_id` | CHAR(36) | Sim | NULL | FK | Variação pedida, para converter a cotação em pedido. Referencia `skus.id` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `quote_items_product_id_idx` | INDEX | `product_id` |
| `quote_items_quote_id_idx` | INDEX | `quote_id` |
| `quote_items_sku_id_idx` | INDEX | `sku_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `product_id` | `products.id` | RESTRICT | CASCADE |
| `quote_id` | `quotes.id` | CASCADE | CASCADE |
| `sku_id` | `skus.id` | RESTRICT | CASCADE |

### quote_attachments

**Entidade:** Anexo da cotação. Arquivo enviado com a cotação, como planta ou especificação (RF08).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `quote_id` | CHAR(36) | Não | — | FK | Cotação vinculada. Referencia `quotes.id` |
| `name` | VARCHAR(191) | Não | — | — | Nome original do arquivo |
| `mime_type` | VARCHAR(100) | Não | — | — | Tipo MIME do arquivo |
| `size_bytes` | INT | Não | — | — | Tamanho do arquivo em bytes |
| `storage_key` | VARCHAR(255) | Não | — | — | Chave do arquivo no armazenamento (S3 compatível; disco local em dev) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `quote_attachments_quote_id_idx` | INDEX | `quote_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `quote_id` | `quotes.id` | CASCADE | CASCADE |

### price_tables

**Entidade:** Tabela de preço. Tabela de preço diferenciada por cliente ou segmento (RF21).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `name` | VARCHAR(120) | Não | — | — | Nome da tabela |
| `description` | VARCHAR(255) | Sim | NULL | — | Descrição |
| `discount_percent` | DECIMAL(5,2) | Não | `0.00` | — | Desconto geral da tabela, de 0 a 100 |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `price_tables_active_deleted_at_idx` | INDEX | `active`, `deleted_at` |

**Gatilhos:** `trg_price_tables_before_insert` (BEFORE INSERT), `trg_price_tables_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### price_table_items

**Entidade:** Item da tabela de preço. Desconto específico de um produto dentro de uma tabela de preço (RF21).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `price_table_id` | CHAR(36) | Não | — | FK | Tabela de preço. Referencia `price_tables.id` |
| `product_id` | CHAR(36) | Não | — | FK | Produto vinculado. Referencia `products.id` |
| `discount_percent` | DECIMAL(5,2) | Não | — | — | Desconto do produto nesta tabela, de 0 a 100 |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `price_table_items_price_table_id_product_id_key` | UNIQUE | `price_table_id`, `product_id` |
| `price_table_items_product_id_idx` | INDEX | `product_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `price_table_id` | `price_tables.id` | CASCADE | CASCADE |
| `product_id` | `products.id` | CASCADE | CASCADE |

**Gatilhos:** `trg_price_table_items_before_insert` (BEFORE INSERT), `trg_price_table_items_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### volume_discounts

**Entidade:** Desconto por volume. Desconto automático por quantidade ou valor mínimo numa categoria (RN04).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `category_id` | CHAR(36) | Não | — | FK | Categoria vinculada. Referencia `categories.id` |
| `min_quantity` | INT | Sim | NULL | — | Quantidade mínima na categoria para o desconto |
| `min_amount` | DECIMAL(12,2) | Sim | NULL | — | Valor mínimo na categoria para o desconto (R$) |
| `discount_percent` | DECIMAL(5,2) | Não | — | — | Percentual de desconto, de 0 a 100 |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `volume_discounts_category_id_active_idx` | INDEX | `category_id`, `active` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `category_id` | `categories.id` | RESTRICT | CASCADE |

**Gatilhos:** `trg_volume_discounts_before_insert` (BEFORE INSERT), `trg_volume_discounts_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### promotions

**Entidade:** Promoção. Promoção por produto, categoria ou cupom, com período e frete cortesia (RF46, RN23).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `name` | VARCHAR(120) | Não | — | — | Nome |
| `scope` | ENUM | Não | — | — | Onde vale: produto, categoria, cupom ou pedido. Valores: `PRODUCT`, `CATEGORY`, `COUPON` |
| `product_id` | CHAR(36) | Sim | NULL | FK | Produto vinculado. Referencia `products.id` |
| `category_id` | CHAR(36) | Sim | NULL | FK | Categoria vinculada. Referencia `categories.id` |
| `coupon_code` | VARCHAR(40) | Sim | NULL | UK | Código do cupom (único) |
| `discount_type` | ENUM | Não | — | — | Percentual ou valor fixo. Valores: `PERCENT`, `FIXED` |
| `discount_value` | DECIMAL(12,2) | Não | `0.00` | — | Percentual ou valor do desconto |
| `free_shipping` | BOOLEAN | Não | `false` | — | Concede frete cortesia (RN23) |
| `min_order_total` | DECIMAL(12,2) | Sim | NULL | — | Valor mínimo do pedido (R$) |
| `starts_at` | DATETIME(3) | Não | — | — | Início da vigência (UTC) |
| `ends_at` | DATETIME(3) | Não | — | — | Fim da vigência (UTC) |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `deleted_at` | DATETIME(3) | Sim | NULL | — | Data e hora da exclusão lógica (soft delete); nulo quando ativo |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `promotions_active_starts_at_ends_at_idx` | INDEX | `active`, `starts_at`, `ends_at` |
| `promotions_category_id_idx` | INDEX | `category_id` |
| `promotions_coupon_code_key` | UNIQUE | `coupon_code` |
| `promotions_product_id_idx` | INDEX | `product_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `category_id` | `categories.id` | RESTRICT | CASCADE |
| `product_id` | `products.id` | RESTRICT | CASCADE |

## Pedidos e logística

### orders

**Entidade:** Pedido. Pedido de compra com valores, endereço congelado e status do ciclo de vida (RF54).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `number` | VARCHAR(20) | Não | — | UK | Número legível, como AB-2026-000123 (único) |
| `user_id` | VARCHAR(36) | Não | — | FK | Cliente que fez o pedido. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa vinculada; nulo para cliente PF. Referencia `organizations.id` |
| `quote_id` | CHAR(36) | Sim | NULL | FK | Cotação convertida neste pedido. Referencia `quotes.id` |
| `status` | ENUM | Não | — | — | Status no ciclo de vida do pedido (RF54). Valores: `AWAITING_APPROVAL`, `AWAITING_SHIPPING_QUOTE`, `AWAITING_PAYMENT`, `PAID`, `IN_PRODUCTION`, `SEPARATING`, `INVOICED`, `SHIPPED`, `DELIVERED`, `INSTALLED`, `CANCELED`, `REFUNDED` |
| `payment_method` | ENUM | Não | — | — | Meio de pagamento escolhido. Valores: `CARD`, `PIX`, `BOLETO`, `INVOICED` |
| `subtotal` | DECIMAL(12,2) | Não | — | — | Soma dos itens antes de descontos e frete (R$) |
| `discount` | DECIMAL(12,2) | Não | `0.00` | — | Desconto concedido (R$) |
| `services_total` | DECIMAL(12,2) | Não | `0.00` | — | Soma dos serviços e personalizações (R$) |
| `shipping_total` | DECIMAL(12,2) | Não | `0.00` | — | Valor do frete (R$) |
| `total` | DECIMAL(12,2) | Não | — | — | Total a pagar (R$) |
| `shipping_address` | JSON | Não | — | — | Cópia do endereço na compra, imune a edições posteriores |
| `scheduled_delivery_at` | DATETIME(3) | Sim | NULL | — | Data agendada de entrega ou instalação (RN05) |
| `requires_approval` | BOOLEAN | Não | `false` | — | Precisa de aprovação corporativa (RN01) |
| `approved_by_id` | VARCHAR(36) | Sim | NULL | FK | Aprovador da conta corporativa. Referencia `users.id` |
| `approved_at` | DATETIME(3) | Sim | NULL | — | Data e hora da aprovação |
| `approval_note` | TEXT | Sim | NULL | — | Justificativa da aprovação ou recusa |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `extra_lead_business_days` | INT | Não | `0` | — | Dias úteis extras de prazo por personalização ou encomenda |
| `applied_promotions` | JSON | Sim | NULL | — | Promoções aplicadas na compra, congeladas (RF46) |
| `coupon_code` | VARCHAR(40) | Sim | NULL | — | Cupom usado no checkout (RF46) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `orders_approved_by_id_fkey` | INDEX | `approved_by_id` |
| `orders_number_key` | UNIQUE | `number` |
| `orders_organization_id_status_idx` | INDEX | `organization_id`, `status` |
| `orders_quote_id_fkey` | INDEX | `quote_id` |
| `orders_scheduled_delivery_at_idx` | INDEX | `scheduled_delivery_at` |
| `orders_status_created_at_idx` | INDEX | `status`, `created_at` |
| `orders_user_id_created_at_idx` | INDEX | `user_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `approved_by_id` | `users.id` | SET NULL | CASCADE |
| `organization_id` | `organizations.id` | RESTRICT | CASCADE |
| `quote_id` | `quotes.id` | SET NULL | CASCADE |
| `user_id` | `users.id` | RESTRICT | CASCADE |

**Gatilhos:** `trg_orders_before_insert` (BEFORE INSERT), `trg_orders_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### order_items

**Entidade:** Item do pedido. Linha do pedido com o preço e o nome congelados na compra.

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `sku_id` | CHAR(36) | Não | — | FK | SKU vinculado. Referencia `skus.id` |
| `product_name` | VARCHAR(191) | Não | — | — | Nome do produto na compra |
| `sku_code` | VARCHAR(64) | Não | — | — | Código do SKU na compra |
| `quantity` | INT | Não | — | — | Quantidade |
| `unit_price` | DECIMAL(12,2) | Não | — | — | Preço unitário em reais (R$) |
| `total` | DECIMAL(12,2) | Não | — | — | Total da linha (R$) |
| `personalization` | JSON | Sim | NULL | — | Personalização escolhida (texto da gravação e opções) (RF51) |
| `services` | JSON | Sim | NULL | — | Serviços adicionais escolhidos (embalagem, montagem) (RF52) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `order_items_order_id_idx` | INDEX | `order_id` |
| `order_items_sku_id_idx` | INDEX | `sku_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | CASCADE | CASCADE |
| `sku_id` | `skus.id` | RESTRICT | CASCADE |

### order_status_history

**Entidade:** Histórico de status. Cada transição de status do pedido, com autor e observação (RF15, RF54).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `from_status` | ENUM | Sim | NULL | — | Status anterior; nulo na abertura. Valores: `AWAITING_APPROVAL`, `AWAITING_SHIPPING_QUOTE`, `AWAITING_PAYMENT`, `PAID`, `IN_PRODUCTION`, `SEPARATING`, `INVOICED`, `SHIPPED`, `DELIVERED`, `INSTALLED`, `CANCELED`, `REFUNDED` |
| `to_status` | ENUM | Não | — | — | Novo status. Valores: `AWAITING_APPROVAL`, `AWAITING_SHIPPING_QUOTE`, `AWAITING_PAYMENT`, `PAID`, `IN_PRODUCTION`, `SEPARATING`, `INVOICED`, `SHIPPED`, `DELIVERED`, `INSTALLED`, `CANCELED`, `REFUNDED` |
| `changed_by_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que mudou o status; nulo quando automático. Referencia `users.id` |
| `note` | VARCHAR(255) | Sim | NULL | — | Observação livre |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `order_status_history_changed_by_id_fkey` | INDEX | `changed_by_id` |
| `order_status_history_order_id_created_at_idx` | INDEX | `order_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `changed_by_id` | `users.id` | SET NULL | CASCADE |
| `order_id` | `orders.id` | CASCADE | CASCADE |

**Gatilhos:** `trg_order_status_history_before_delete` (BEFORE DELETE), `trg_order_status_history_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### order_approvals

**Entidade:** Aprovação do pedido. Decisão do aprovador da conta corporativa sobre um pedido (RF11, RN01).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `decision` | ENUM | Não | — | — | Aprovado ou recusado. Valores: `APPROVED`, `REJECTED` |
| `decided_by_id` | VARCHAR(36) | Não | — | FK | Aprovador que decidiu. Referencia `users.id` |
| `note` | TEXT | Sim | NULL | — | Observação livre |
| `order_total` | DECIMAL(12,2) | Não | — | — | Total do pedido no momento da decisão (R$) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `order_approvals_decided_by_id_idx` | INDEX | `decided_by_id` |
| `order_approvals_order_id_created_at_idx` | INDEX | `order_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `decided_by_id` | `users.id` | RESTRICT | CASCADE |
| `order_id` | `orders.id` | CASCADE | CASCADE |

### shipments

**Entidade:** Envio. Frete escolhido e rastreio do pedido (RF25, RF49, RF50).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK, UK | Pedido enviado (único). Referencia `orders.id` |
| `method` | ENUM | Não | — | — | Correios, transportadora, entrega própria ou cotação manual. Valores: `CORREIOS_PAC`, `CORREIOS_SEDEX`, `CARRIER`, `OWN_DELIVERY`, `MANUAL_QUOTE` |
| `carrier` | VARCHAR(120) | Sim | NULL | — | Transportadora |
| `service` | VARCHAR(120) | Sim | NULL | — | Serviço contratado (PAC, SEDEX, etc.) |
| `price` | DECIMAL(12,2) | Não | — | — | Valor do frete (R$) |
| `delivery_days` | INT | Sim | NULL | — | Prazo de entrega em dias úteis |
| `tracking_code` | VARCHAR(64) | Sim | NULL | — | Código de rastreio |
| `quote_data` | JSON | Sim | NULL | — | Resposta da cotação de frete usada na compra |
| `shipped_at` | DATETIME(3) | Sim | NULL | — | Data e hora do despacho |
| `delivered_at` | DATETIME(3) | Sim | NULL | — | Data e hora da entrega |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `shipments_order_id_key` | UNIQUE | `order_id` |
| `shipments_tracking_code_idx` | INDEX | `tracking_code` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | CASCADE | CASCADE |

### shipping_regions

**Entidade:** Região de entrega. Faixa de CEP com entrega própria, tabela de montagem e frete grátis (RF27, RF50, RN16, RN23).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `name` | VARCHAR(120) | Não | — | — | Nome da região |
| `cep_start` | CHAR(8) | Não | — | — | Início da faixa de CEP |
| `cep_end` | CHAR(8) | Não | — | — | Fim da faixa de CEP |
| `own_delivery` | BOOLEAN | Não | `false` | — | Atendida pela entrega e montagem própria (RN16) |
| `own_delivery_rates` | JSON | Sim | NULL | — | Tabela de preço por faixa de peso da entrega própria (RF50) |
| `free_shipping_minimum` | DECIMAL(12,2) | Sim | NULL | — | Valor mínimo para frete grátis na região (R$) (RN23) |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `shipping_regions_cep_start_cep_end_idx` | INDEX | `cep_start`, `cep_end` |

## Financeiro e fiscal

### payments

**Entidade:** Pagamento. Pagamento via Mercado Pago (cartão, Pix, boleto) ou faturado, com payment_id único (RF29, RF32).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `method` | ENUM | Não | — | — | Cartão, Pix, boleto ou faturado. Valores: `CARD`, `PIX`, `BOLETO`, `INVOICED` |
| `status` | ENUM | Não | `PENDING` | — | Situação atual (ver enumeração). Valores: `PENDING`, `APPROVED`, `REJECTED`, `CANCELED`, `EXPIRED`, `REFUNDED`, `PARTIALLY_REFUNDED` |
| `payment_id` | VARCHAR(64) | Sim | NULL | UK | Id do pagamento no Mercado Pago (único) (RF32) |
| `provider_status` | VARCHAR(64) | Sim | NULL | — | Status devolvido pelo Mercado Pago |
| `amount` | DECIMAL(12,2) | Não | — | — | Valor cobrado (R$) |
| `refunded_amount` | DECIMAL(12,2) | Não | `0.00` | — | Valor já estornado (R$); nunca maior que o cobrado |
| `installments` | INT | Não | `1` | — | Número de parcelas no cartão |
| `expires_at` | DATETIME(3) | Sim | NULL | — | Expiração do Pix ou do boleto (RN14) |
| `pix_qr_code` | TEXT | Sim | NULL | — | Código Pix copia e cola |
| `boleto_url` | TEXT | Sim | NULL | — | Link do boleto |
| `paid_at` | DATETIME(3) | Sim | NULL | — | Data e hora da confirmação do pagamento |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `status_detail` | VARCHAR(64) | Sim | NULL | — | Detalhe do status no Mercado Pago |
| `boleto_line` | VARCHAR(64) | Sim | NULL | — | Linha digitável do boleto |
| `pix_qr_code_image` | MEDIUMTEXT | Sim | NULL | — | Imagem do QR Code Pix em base64 |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `payments_order_id_idx` | INDEX | `order_id` |
| `payments_payment_id_key` | UNIQUE | `payment_id` |
| `payments_status_expires_at_idx` | INDEX | `status`, `expires_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | RESTRICT | CASCADE |

**Gatilhos:** `trg_payments_before_insert` (BEFORE INSERT), `trg_payments_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### payment_notifications

**Entidade:** Notificação de pagamento. Webhook recebido do Mercado Pago, usado para idempotência (RF30).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `request_id` | VARCHAR(128) | Não | — | UK | x-request-id do webhook (único), para idempotência |
| `topic` | VARCHAR(40) | Não | — | — | Tópico da notificação |
| `resource_id` | VARCHAR(64) | Não | — | — | Id do recurso notificado |
| `received_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Recebimento (UTC) |
| `processed_at` | DATETIME(3) | Sim | NULL | — | Processamento (UTC); nulo enquanto pendente |
| `attempts` | INT | Não | `0` | — | Número de tentativas feitas |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `payment_notifications_request_id_key` | UNIQUE | `request_id` |
| `payment_notifications_resource_id_idx` | INDEX | `resource_id` |

### refunds

**Entidade:** Estorno. Devolução total ou parcial de valor ao cliente (RF34, RN07, RN18, RN22).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `payment_row_id` | CHAR(36) | Sim | NULL | FK | Pagamento estornado. Referencia `payments.id` |
| `kind` | ENUM | Não | — | — | Total ou parcial. Valores: `FULL`, `PARTIAL` |
| `reason` | ENUM | Não | — | — | Cancelamento, arrependimento, devolução avaliada ou ajuste. Valores: `CANCELLATION`, `WITHDRAWAL`, `EVALUATED_RETURN`, `ADJUSTMENT` |
| `channel` | ENUM | Não | — | — | API do Mercado Pago ou transferência (faturado). Valores: `MERCADO_PAGO`, `MANUAL_TRANSFER` |
| `amount` | DECIMAL(12,2) | Não | — | — | Valor estornado (R$); sempre positivo |
| `status` | ENUM | Não | — | — | Situação atual (ver enumeração). Valores: `PENDING_APPROVAL`, `PROCESSING`, `COMPLETED`, `FAILED`, `REJECTED` |
| `provider_refund_id` | VARCHAR(64) | Sim | NULL | UK | Id do estorno no Mercado Pago (único) |
| `note` | VARCHAR(500) | Não | — | — | Justificativa do pedido de estorno |
| `failure_reason` | VARCHAR(255) | Sim | NULL | — | Motivo da falha no provedor |
| `requested_by_id` | VARCHAR(36) | Não | — | FK | Usuário que pediu o estorno. Referencia `users.id` |
| `decided_by_id` | VARCHAR(36) | Sim | NULL | FK | Financeiro que aprovou ou recusou (RN07). Referencia `users.id` |
| `decided_at` | DATETIME(3) | Sim | NULL | — | Data e hora da decisão |
| `decision_note` | VARCHAR(255) | Sim | NULL | — | Justificativa da decisão |
| `completed_at` | DATETIME(3) | Sim | NULL | — | Data e hora da conclusão |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `refunds_decided_by_id_idx` | INDEX | `decided_by_id` |
| `refunds_order_id_created_at_idx` | INDEX | `order_id`, `created_at` |
| `refunds_payment_row_id_idx` | INDEX | `payment_row_id` |
| `refunds_provider_refund_id_key` | UNIQUE | `provider_refund_id` |
| `refunds_requested_by_id_idx` | INDEX | `requested_by_id` |
| `refunds_status_created_at_idx` | INDEX | `status`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `decided_by_id` | `users.id` | SET NULL | CASCADE |
| `order_id` | `orders.id` | RESTRICT | CASCADE |
| `payment_row_id` | `payments.id` | RESTRICT | CASCADE |
| `requested_by_id` | `users.id` | RESTRICT | CASCADE |

**Gatilhos:** `trg_refunds_before_insert` (BEFORE INSERT), `trg_refunds_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### invoiced_installments

**Entidade:** Parcela faturada. Parcela de pedido faturado 28/56 dias, com vencimento e baixa (RF33, RN03).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `sequence` | INT | Não | — | — | Ordem da parcela (1, 2...) |
| `due_days` | INT | Não | — | — | Prazo em dias corridos: 28 ou 56 (RN03) |
| `amount` | DECIMAL(12,2) | Não | — | — | Valor da parcela (R$) |
| `due_date` | DATETIME(3) | Não | — | — | Data de vencimento |
| `status` | ENUM | Não | `OPEN` | — | Situação atual (ver enumeração). Valores: `OPEN`, `PAID`, `CANCELED` |
| `boleto_number` | VARCHAR(20) | Não | — | UK | Nosso número do boleto |
| `digitable_line` | VARCHAR(64) | Não | — | — | Linha digitável |
| `paid_at` | DATETIME(3) | Sim | NULL | — | Data e hora da baixa |
| `paid_amount` | DECIMAL(12,2) | Sim | NULL | — | Valor recebido (R$) |
| `settled_by_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que deu a baixa manual. Referencia `users.id` |
| `settlement_method` | ENUM | Sim | NULL | — | Baixa manual ou retorno bancário. Valores: `MANUAL`, `BANK_RETURN` |
| `settlement_note` | VARCHAR(255) | Sim | NULL | — | Observação da baixa |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `invoiced_installments_boleto_number_key` | UNIQUE | `boleto_number` |
| `invoiced_installments_order_id_sequence_key` | UNIQUE | `order_id`, `sequence` |
| `invoiced_installments_settled_by_id_idx` | INDEX | `settled_by_id` |
| `invoiced_installments_status_due_date_idx` | INDEX | `status`, `due_date` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | RESTRICT | CASCADE |
| `settled_by_id` | `users.id` | SET NULL | CASCADE |

### invoices

**Entidade:** NF-e. Nota fiscal eletrônica do pedido: chave, XML, DANFE e tentativas de emissão (RF13).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `order_id` | CHAR(36) | Não | — | FK, UK | Pedido faturado (único). Referencia `orders.id` |
| `status` | ENUM | Não | `PENDING` | — | Situação atual (ver enumeração). Valores: `PENDING`, `PROCESSING`, `ISSUED`, `FAILED` |
| `access_key` | CHAR(44) | Sim | NULL | UK | Chave de acesso de 44 dígitos (única) |
| `number` | VARCHAR(20) | Sim | NULL | — | Número da NF-e |
| `series` | VARCHAR(5) | Sim | NULL | — | Série da NF-e |
| `protocol` | VARCHAR(64) | Sim | NULL | — | Protocolo de autorização da SEFAZ |
| `xml` | MEDIUMTEXT | Sim | NULL | — | XML autorizado da NF-e |
| `danfe_key` | VARCHAR(255) | Sim | NULL | — | Chave do PDF do DANFE no armazenamento |
| `submitted_at` | DATETIME(3) | Sim | NULL | — | Envio ao emissor fiscal |
| `attempts` | INT | Não | `0` | — | Número de tentativas feitas |
| `last_error` | VARCHAR(500) | Sim | NULL | — | Último erro, sem dados pessoais |
| `next_attempt_at` | DATETIME(3) | Sim | NULL | — | Quando a próxima tentativa pode ocorrer (UTC) |
| `alerted_at` | DATETIME(3) | Sim | NULL | — | Quando o financeiro foi alertado das falhas |
| `issued_at` | DATETIME(3) | Sim | NULL | — | Data e hora da autorização |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `invoices_access_key_key` | UNIQUE | `access_key` |
| `invoices_order_id_key` | UNIQUE | `order_id` |
| `invoices_status_next_attempt_at_idx` | INDEX | `status`, `next_attempt_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | RESTRICT | CASCADE |

**Gatilhos:** `trg_invoices_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### credit_limit_changes

**Entidade:** Alteração de crédito. Histórico de aprovação e de limite de crédito da conta corporativa (RF58, RN10).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `organization_id` | VARCHAR(36) | Não | — | FK | Conta corporativa. Referencia `organizations.id` |
| `previous_limit` | DECIMAL(12,2) | Sim | NULL | — | Limite anterior (R$) |
| `new_limit` | DECIMAL(12,2) | Sim | NULL | — | Novo limite (R$) |
| `status` | ENUM | Não | — | — | Situação de crédito definida. Valores: `NONE`, `PENDING`, `APPROVED`, `REJECTED` |
| `changed_by_id` | VARCHAR(36) | Não | — | FK | Financeiro que alterou. Referencia `users.id` |
| `note` | VARCHAR(255) | Sim | NULL | — | Observação livre |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `previous_status` | ENUM | Sim | NULL | — | Situação de crédito anterior. Valores: `NONE`, `PENDING`, `APPROVED`, `REJECTED` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `credit_limit_changes_changed_by_id_idx` | INDEX | `changed_by_id` |
| `credit_limit_changes_organization_id_created_at_idx` | INDEX | `organization_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `changed_by_id` | `users.id` | RESTRICT | CASCADE |
| `organization_id` | `organizations.id` | CASCADE | CASCADE |

## Pós-venda e atendimento

### support_tickets

**Entidade:** Chamado. Chamado de garantia, troca, devolução ou arrependimento (RF17, RN12, RN22).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `number` | VARCHAR(20) | Não | — | UK | Número legível do chamado (único) |
| `kind` | ENUM | Não | — | — | Garantia, troca, devolução ou arrependimento. Valores: `WARRANTY`, `TECHNICAL_ASSISTANCE`, `EXCHANGE`, `RETURN`, `WITHDRAWAL` |
| `status` | ENUM | Não | `OPEN` | — | Situação atual (ver enumeração). Valores: `OPEN`, `IN_ANALYSIS`, `WAITING_CUSTOMER`, `RESOLVED`, `DENIED` |
| `user_id` | VARCHAR(36) | Não | — | FK | Cliente que abriu. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa vinculada; nulo para cliente PF. Referencia `organizations.id` |
| `order_id` | CHAR(36) | Não | — | FK | Pedido vinculado. Referencia `orders.id` |
| `order_item_id` | CHAR(36) | Não | — | FK | Item do pedido reclamado. Referencia `order_items.id` |
| `subject` | VARCHAR(160) | Não | — | — | Assunto |
| `description` | TEXT | Não | — | — | Relato do cliente |
| `resolution` | TEXT | Sim | NULL | — | Solução registrada pela equipe |
| `closed_at` | DATETIME(3) | Sim | NULL | — | Data e hora do encerramento |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |
| `legal_review` | BOOLEAN | Não | `false` | — | Depende de parecer jurídico (item personalizado de PF) |
| `personalized` | BOOLEAN | Não | `false` | — | O item reclamado foi personalizado (RN12, RN24) |
| `return_outcome` | ENUM | Sim | NULL | — | Resultado da avaliação técnica. Valores: `EXCHANGE`, `REPAIR`, `REFUND` |
| `return_reason` | ENUM | Sim | NULL | — | Motivo da troca ou devolução. Valores: `DEFECT`, `TRANSPORT_DAMAGE`, `WRONG_ITEM`, `NOT_AS_EXPECTED`, `OTHER` |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `support_tickets_number_key` | UNIQUE | `number` |
| `support_tickets_order_id_idx` | INDEX | `order_id` |
| `support_tickets_order_item_id_idx` | INDEX | `order_item_id` |
| `support_tickets_organization_id_created_at_idx` | INDEX | `organization_id`, `created_at` |
| `support_tickets_status_created_at_idx` | INDEX | `status`, `created_at` |
| `support_tickets_user_id_created_at_idx` | INDEX | `user_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `order_id` | `orders.id` | RESTRICT | CASCADE |
| `order_item_id` | `order_items.id` | RESTRICT | CASCADE |
| `organization_id` | `organizations.id` | RESTRICT | CASCADE |
| `user_id` | `users.id` | RESTRICT | CASCADE |

### support_ticket_events

**Entidade:** Evento do chamado. Mensagem ou mudança de status de um chamado (RF17).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `ticket_id` | CHAR(36) | Não | — | FK | Chamado vinculado. Referencia `support_tickets.id` |
| `from_status` | ENUM | Sim | NULL | — | Status anterior; nulo na abertura. Valores: `OPEN`, `IN_ANALYSIS`, `WAITING_CUSTOMER`, `RESOLVED`, `DENIED` |
| `to_status` | ENUM | Sim | NULL | — | Novo status. Valores: `OPEN`, `IN_ANALYSIS`, `WAITING_CUSTOMER`, `RESOLVED`, `DENIED` |
| `message` | TEXT | Sim | NULL | — | Mensagem |
| `author_id` | VARCHAR(36) | Sim | NULL | FK | Autor da mensagem ou da mudança. Referencia `users.id` |
| `from_team` | BOOLEAN | Não | `false` | — | Indica se veio da equipe da loja (e não do cliente) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `support_ticket_events_author_id_idx` | INDEX | `author_id` |
| `support_ticket_events_ticket_id_created_at_idx` | INDEX | `ticket_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `author_id` | `users.id` | SET NULL | CASCADE |
| `ticket_id` | `support_tickets.id` | CASCADE | CASCADE |

### support_ticket_attachments

**Entidade:** Anexo do chamado. Foto ou documento enviado no chamado (RF17).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `ticket_id` | CHAR(36) | Não | — | FK | Chamado vinculado. Referencia `support_tickets.id` |
| `name` | VARCHAR(191) | Não | — | — | Nome original do arquivo |
| `mime_type` | VARCHAR(100) | Não | — | — | Tipo MIME do arquivo |
| `size_bytes` | INT | Não | — | — | Tamanho do arquivo em bytes |
| `storage_key` | VARCHAR(255) | Não | — | — | Chave do arquivo no armazenamento (S3 compatível; disco local em dev) |
| `from_team` | BOOLEAN | Não | `false` | — | Indica se veio da equipe da loja (e não do cliente) |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `support_ticket_attachments_ticket_id_idx` | INDEX | `ticket_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `ticket_id` | `support_tickets.id` | CASCADE | CASCADE |

### seller_rules

**Entidade:** Regra de vendedor. Regra de atribuição do vendedor dedicado por UF e tipo de pessoa (RF18, RN11).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `seller_id` | VARCHAR(36) | Não | — | FK | Vendedor atribuído. Referencia `users.id` |
| `person_type` | ENUM | Sim | NULL | — | Tipo de pessoa atendida; nulo vale para ambos. Valores: `PF`, `PJ` |
| `state` | CHAR(2) | Sim | NULL | — | UF atendida; nulo vale para todas |
| `active` | BOOLEAN | Não | `true` | — | Indica se o registro está ativo |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `seller_rules_active_person_type_state_idx` | INDEX | `active`, `person_type`, `state` |
| `seller_rules_seller_id_idx` | INDEX | `seller_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `seller_id` | `users.id` | RESTRICT | CASCADE |

### demo_requests

**Entidade:** Demonstração. Pedido de reunião ou demonstração de produto (RF19).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `user_id` | VARCHAR(36) | Não | — | FK | Cliente que pediu. Referencia `users.id` |
| `organization_id` | VARCHAR(36) | Sim | NULL | FK | Conta corporativa vinculada; nulo para cliente PF. Referencia `organizations.id` |
| `product_id` | CHAR(36) | Sim | NULL | FK | Produto vinculado. Referencia `products.id` |
| `seller_id` | VARCHAR(36) | Sim | NULL | FK | Vendedor responsável. Referencia `users.id` |
| `mode` | ENUM | Não | — | — | Modalidade (ver enumeração). Valores: `SHOWROOM`, `ONLINE`, `ON_SITE` |
| `scheduled_at` | DATETIME(3) | Não | — | — | Data e hora combinadas (UTC) |
| `status` | ENUM | Não | `REQUESTED` | — | Situação atual (ver enumeração). Valores: `REQUESTED`, `CONFIRMED`, `CANCELED`, `DONE` |
| `phone` | VARCHAR(20) | Sim | NULL | — | Telefone de contato |
| `notes` | TEXT | Sim | NULL | — | Observações do cliente |
| `team_note` | TEXT | Sim | NULL | — | Observação interna da equipe |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `demo_requests_organization_id_idx` | INDEX | `organization_id` |
| `demo_requests_product_id_idx` | INDEX | `product_id` |
| `demo_requests_scheduled_at_status_idx` | INDEX | `scheduled_at`, `status` |
| `demo_requests_seller_id_scheduled_at_idx` | INDEX | `seller_id`, `scheduled_at` |
| `demo_requests_user_id_created_at_idx` | INDEX | `user_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `organization_id` | `organizations.id` | RESTRICT | CASCADE |
| `product_id` | `products.id` | SET NULL | CASCADE |
| `seller_id` | `users.id` | SET NULL | CASCADE |
| `user_id` | `users.id` | RESTRICT | CASCADE |

## Plataforma e auditoria

### settings

**Entidade:** Configuração. Valor configurável das regras de negócio, editado no back office (RN01, RN06, RN14, RN16, RN20).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `key` | VARCHAR(100) | Não | — | PK | Chave da configuração (chave primária) |
| `value` | JSON | Não | — | — | Valor em JSON |
| `description` | VARCHAR(255) | Não | — | — | Explicação exibida no back office |
| `updated_by_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que alterou por último. Referencia `users.id` |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `settings_updated_by_id_idx` | INDEX | `updated_by_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `updated_by_id` | `users.id` | SET NULL | CASCADE |

### institutional_pages

**Entidade:** Página institucional. Texto das páginas de termos, privacidade, trocas e garantia (RF57).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `slug` | VARCHAR(80) | Não | — | PK | Página: termos, privacidade, trocas ou garantia (chave primária) |
| `title` | VARCHAR(120) | Não | — | — | Título da página |
| `body` | MEDIUMTEXT | Não | — | — | Conteúdo em Markdown |
| `updated_by_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que editou por último. Referencia `users.id` |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `institutional_pages_updated_by_id_idx` | INDEX | `updated_by_id` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `updated_by_id` | `users.id` | SET NULL | CASCADE |

### audit_logs

**Entidade:** Log de auditoria. Registro imutável das ações sensíveis, com antes e depois (RNF12).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `user_id` | VARCHAR(36) | Sim | NULL | FK | Usuário que executou a ação; nulo para ação do sistema. Referencia `users.id` |
| `action` | VARCHAR(100) | Não | — | — | Ação, como order.approve ou user.roles |
| `entity` | VARCHAR(64) | Não | — | — | Tabela ou entidade afetada |
| `entity_id` | VARCHAR(36) | Sim | NULL | — | Id do registro afetado |
| `before` | JSON | Sim | NULL | — | Estado anterior em JSON |
| `after` | JSON | Sim | NULL | — | Estado posterior em JSON |
| `ip_address` | VARCHAR(64) | Sim | NULL | — | Endereço IP de origem |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `audit_logs_action_created_at_idx` | INDEX | `action`, `created_at` |
| `audit_logs_created_at_idx` | INDEX | `created_at` |
| `audit_logs_entity_entity_id_idx` | INDEX | `entity`, `entity_id` |
| `audit_logs_user_id_created_at_idx` | INDEX | `user_id`, `created_at` |

**Chaves estrangeiras**

| Coluna | Referência | Ao excluir | Ao alterar |
|---|---|---|---|
| `user_id` | `users.id` | SET NULL | CASCADE |

**Gatilhos:** `trg_audit_logs_before_delete` (BEFORE DELETE), `trg_audit_logs_before_update` (BEFORE UPDATE). Ver [gatilhos](05-gatilhos.md).

### email_outbox

**Entidade:** E-mail. Fila de e-mails transacionais com novas tentativas (RF53).

| Coluna | Tipo | Nulo | Padrão | Chave | Descrição |
|---|---|---|---|---|---|
| `id` | CHAR(36) | Não | — | PK | Identificador único do registro (UUID) |
| `template` | VARCHAR(64) | Não | — | — | Modelo do e-mail |
| `recipient` | VARCHAR(191) | Não | — | — | Destinatário |
| `subject` | VARCHAR(255) | Não | — | — | Assunto |
| `text` | TEXT | Não | — | — | Corpo em texto puro |
| `html` | MEDIUMTEXT | Não | — | — | Corpo em HTML |
| `status` | ENUM | Não | `PENDING` | — | Situação atual (ver enumeração). Valores: `PENDING`, `SENT`, `FAILED` |
| `attempts` | INT | Não | `0` | — | Número de tentativas feitas |
| `next_attempt_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Quando a próxima tentativa pode ocorrer (UTC) |
| `last_error` | VARCHAR(120) | Sim | NULL | — | Último erro, sem dados pessoais |
| `sent_at` | DATETIME(3) | Sim | NULL | — | Data e hora do envio |
| `created_at` | DATETIME(3) | Não | `CURRENT_TIMESTAMP(3)` | — | Data e hora de criação (UTC) |
| `updated_at` | DATETIME(3) | Não | — | — | Data e hora da última alteração (UTC) |

**Índices**

| Nome | Tipo | Colunas |
|---|---|---|
| `email_outbox_created_at_idx` | INDEX | `created_at` |
| `email_outbox_status_next_attempt_at_idx` | INDEX | `status`, `next_attempt_at` |

