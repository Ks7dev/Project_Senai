# Atelier Bureau — DER (modelo conceitual)

> Gerado por `npm run db:docs` a partir do banco criado pelas migrations (`prisma/migrations`), pelas chaves estrangeiras. Fonte da verdade: [`prisma/schema.prisma`](../../prisma/schema.prisma). Não edite à mão: altere o schema ou `scripts/db-docs/descriptions.ts` e gere de novo.

Notação de Chen: retângulos são entidades, losangos são relacionamentos e o rótulo das linhas é a cardinalidade (1, N ou 0..1 quando a participação é opcional). Entidades com borda tracejada pertencem a outro domínio e aparecem só para mostrar a ligação.

O modelo tem 52 entidades, 79 relacionamentos por chave estrangeira e 7 domínios. Os atributos estão no [MER](03-mer.md) e no [dicionário de dados](04-dicionario-de-dados.md).

## Visão geral dos domínios

| Domínio | Entidades |
|---|---|
| Acesso, contas e perfis | Usuário, Sessão, Credencial, Verificação, Segundo fator, Conta corporativa, Membro, Convite, Perfil interno, Permissão, Permissão do perfil, Perfil do usuário, Endereço |
| Catálogo e estoque | Categoria, Produto, Imagem do produto, Documento do produto, SKU, Estoque, Movimento de estoque, Favorito |
| Carrinho, cotação, preços e promoções | Carrinho, Item do carrinho, Cotação, Item da cotação, Anexo da cotação, Tabela de preço, Item da tabela de preço, Desconto por volume, Promoção |
| Pedidos e logística | Pedido, Item do pedido, Histórico de status, Aprovação do pedido, Envio, Região de entrega |
| Financeiro e fiscal | Pagamento, Notificação de pagamento, Estorno, Parcela faturada, NF-e, Alteração de crédito |
| Pós-venda e atendimento | Chamado, Evento do chamado, Anexo do chamado, Regra de vendedor, Demonstração |
| Plataforma e auditoria | Configuração, Página institucional, Log de auditoria, E-mail, Limite de tentativas |

```mermaid
flowchart LR
  acesso["Acesso, contas e perfis"]
  catalogo["Catálogo e estoque"]
  comercial["Carrinho, cotação, preços e promoções"]
  pedidos["Pedidos e logística"]
  financeiro["Financeiro e fiscal"]
  posvenda["Pós-venda e atendimento"]
  plataforma["Plataforma e auditoria"]
  acesso -- "3 FK" --> plataforma
  catalogo -- "7 FK" --> comercial
  acesso -- "5 FK" --> comercial
  acesso -- "5 FK" --> financeiro
  acesso -- "7 FK" --> posvenda
  catalogo -- "1 FK" --> posvenda
  acesso -- "2 FK" --> catalogo
  pedidos -- "4 FK" --> financeiro
  acesso -- "5 FK" --> pedidos
  catalogo -- "1 FK" --> pedidos
  comercial -- "1 FK" --> pedidos
  comercial -- "2 FK" --> acesso
  pedidos -- "1 FK" --> catalogo
  pedidos -- "2 FK" --> posvenda
```

A seta vai do domínio referenciado para o domínio que guarda a chave estrangeira.

## Acesso, contas e perfis

```mermaid
flowchart LR
  e_users["Usuário"]
  e_sessions["Sessão"]
  e_accounts["Credencial"]
  e_verifications["Verificação"]
  e_two_factors["Segundo fator"]
  e_organizations["Conta corporativa"]
  e_members["Membro"]
  e_invitations["Convite"]
  e_roles["Perfil interno"]
  e_permissions["Permissão"]
  e_role_permissions["Permissão do perfil"]
  e_user_roles["Perfil do usuário"]
  e_addresses["Endereço"]
  e_price_tables["Tabela de preço"]:::ext
  r0{"possui"}
  e_users -- "1" --- r0
  r0 -- "N" --- e_accounts
  r1{"cadastra"}
  e_organizations -- "0..1" --- r1
  r1 -- "N" --- e_addresses
  r2{"cadastra"}
  e_users -- "0..1" --- r2
  r2 -- "N" --- e_addresses
  r3{"convida"}
  e_users -- "1" --- r3
  r3 -- "N" --- e_invitations
  r4{"envia"}
  e_organizations -- "1" --- r4
  r4 -- "N" --- e_invitations
  r5{"tem"}
  e_organizations -- "1" --- r5
  r5 -- "N" --- e_members
  r6{"participa de"}
  e_users -- "1" --- r6
  r6 -- "N" --- e_members
  r7{"usa"}
  e_price_tables -- "0..1" --- r7
  r7 -- "N" --- e_organizations
  r8{"atende"}
  e_users -- "0..1" --- r8
  r8 -- "N" --- e_organizations
  r9{"compõe"}
  e_permissions -- "1" --- r9
  r9 -- "N" --- e_role_permissions
  r10{"concede"}
  e_roles -- "1" --- r10
  r10 -- "N" --- e_role_permissions
  r11{"abre"}
  e_users -- "1" --- r11
  r11 -- "N" --- e_sessions
  r12{"protege"}
  e_users -- "1" --- r12
  r12 -- "N" --- e_two_factors
  r13{"é atribuído em"}
  e_roles -- "1" --- r13
  r13 -- "N" --- e_user_roles
  r14{"recebe"}
  e_users -- "1" --- r14
  r14 -- "N" --- e_user_roles
  r15{"usa"}
  e_price_tables -- "0..1" --- r15
  r15 -- "N" --- e_users
  classDef ext stroke-dasharray: 4 3
```

## Catálogo e estoque

```mermaid
flowchart LR
  e_categories["Categoria"]
  e_products["Produto"]
  e_product_images["Imagem do produto"]
  e_product_documents["Documento do produto"]
  e_skus["SKU"]
  e_stock["Estoque"]
  e_stock_movements["Movimento de estoque"]
  e_favorites["Favorito"]
  e_users["Usuário"]:::ext
  e_orders["Pedido"]:::ext
  r0{"contém"}
  e_categories -- "0..1" --- r0
  r0 -- "N" --- e_categories
  r1{"é favoritado em"}
  e_products -- "1" --- r1
  r1 -- "N" --- e_favorites
  r2{"favorita"}
  e_users -- "1" --- r2
  r2 -- "N" --- e_favorites
  r3{"documenta"}
  e_products -- "1" --- r3
  r3 -- "N" --- e_product_documents
  r4{"ilustra"}
  e_products -- "1" --- r4
  r4 -- "N" --- e_product_images
  r5{"classifica"}
  e_categories -- "1" --- r5
  r5 -- "N" --- e_products
  r6{"varia em"}
  e_products -- "1" --- r6
  r6 -- "N" --- e_skus
  r7{"tem saldo"}
  e_skus -- "1" --- r7
  r7 -- "1" --- e_stock
  r8{"gera"}
  e_orders -- "0..1" --- r8
  r8 -- "N" --- e_stock_movements
  r9{"movimenta"}
  e_skus -- "1" --- r9
  r9 -- "N" --- e_stock_movements
  r10{"lança"}
  e_users -- "0..1" --- r10
  r10 -- "N" --- e_stock_movements
  classDef ext stroke-dasharray: 4 3
```

## Carrinho, cotação, preços e promoções

```mermaid
flowchart LR
  e_carts["Carrinho"]
  e_cart_items["Item do carrinho"]
  e_quotes["Cotação"]
  e_quote_items["Item da cotação"]
  e_quote_attachments["Anexo da cotação"]
  e_price_tables["Tabela de preço"]
  e_price_table_items["Item da tabela de preço"]
  e_volume_discounts["Desconto por volume"]
  e_promotions["Promoção"]
  e_skus["SKU"]:::ext
  e_organizations["Conta corporativa"]:::ext
  e_users["Usuário"]:::ext
  e_products["Produto"]:::ext
  e_categories["Categoria"]:::ext
  r0{"contém"}
  e_carts -- "1" --- r0
  r0 -- "N" --- e_cart_items
  r1{"está em"}
  e_skus -- "1" --- r1
  r1 -- "N" --- e_cart_items
  r2{"compartilha"}
  e_organizations -- "0..1" --- r2
  r2 -- "N" --- e_carts
  r3{"monta"}
  e_users -- "0..1" --- r3
  r3 -- "N" --- e_carts
  r4{"contém"}
  e_price_tables -- "1" --- r4
  r4 -- "N" --- e_price_table_items
  r5{"tem preço em"}
  e_products -- "1" --- r5
  r5 -- "N" --- e_price_table_items
  r6{"é promovida em"}
  e_categories -- "0..1" --- r6
  r6 -- "N" --- e_promotions
  r7{"é promovido em"}
  e_products -- "0..1" --- r7
  r7 -- "N" --- e_promotions
  r8{"anexa"}
  e_quotes -- "1" --- r8
  r8 -- "N" --- e_quote_attachments
  r9{"é cotado em"}
  e_products -- "1" --- r9
  r9 -- "N" --- e_quote_items
  r10{"contém"}
  e_quotes -- "1" --- r10
  r10 -- "N" --- e_quote_items
  r11{"é cotado em"}
  e_skus -- "0..1" --- r11
  r11 -- "N" --- e_quote_items
  r12{"responde"}
  e_users -- "0..1" --- r12
  r12 -- "N" --- e_quotes
  r13{"solicita"}
  e_organizations -- "0..1" --- r13
  r13 -- "N" --- e_quotes
  r14{"solicita"}
  e_users -- "1" --- r14
  r14 -- "N" --- e_quotes
  r15{"tem desconto"}
  e_categories -- "1" --- r15
  r15 -- "N" --- e_volume_discounts
  classDef ext stroke-dasharray: 4 3
```

## Pedidos e logística

```mermaid
flowchart LR
  e_orders["Pedido"]
  e_order_items["Item do pedido"]
  e_order_status_history["Histórico de status"]
  e_order_approvals["Aprovação do pedido"]
  e_shipments["Envio"]
  e_shipping_regions["Região de entrega"]
  e_users["Usuário"]:::ext
  e_skus["SKU"]:::ext
  e_organizations["Conta corporativa"]:::ext
  e_quotes["Cotação"]:::ext
  r0{"decide"}
  e_users -- "1" --- r0
  r0 -- "N" --- e_order_approvals
  r1{"recebe"}
  e_orders -- "1" --- r1
  r1 -- "N" --- e_order_approvals
  r2{"contém"}
  e_orders -- "1" --- r2
  r2 -- "N" --- e_order_items
  r3{"é vendido em"}
  e_skus -- "1" --- r3
  r3 -- "N" --- e_order_items
  r4{"altera"}
  e_users -- "0..1" --- r4
  r4 -- "N" --- e_order_status_history
  r5{"registra"}
  e_orders -- "1" --- r5
  r5 -- "N" --- e_order_status_history
  r6{"aprova"}
  e_users -- "0..1" --- r6
  r6 -- "N" --- e_orders
  r7{"compra em"}
  e_organizations -- "0..1" --- r7
  r7 -- "N" --- e_orders
  r8{"converte em"}
  e_quotes -- "0..1" --- r8
  r8 -- "N" --- e_orders
  r9{"faz"}
  e_users -- "1" --- r9
  r9 -- "N" --- e_orders
  r10{"é enviado por"}
  e_orders -- "1" --- r10
  r10 -- "1" --- e_shipments
  classDef ext stroke-dasharray: 4 3
```

## Financeiro e fiscal

```mermaid
flowchart LR
  e_payments["Pagamento"]
  e_payment_notifications["Notificação de pagamento"]
  e_refunds["Estorno"]
  e_invoiced_installments["Parcela faturada"]
  e_invoices["NF-e"]
  e_credit_limit_changes["Alteração de crédito"]
  e_users["Usuário"]:::ext
  e_organizations["Conta corporativa"]:::ext
  e_orders["Pedido"]:::ext
  r0{"altera"}
  e_users -- "1" --- r0
  r0 -- "N" --- e_credit_limit_changes
  r1{"tem histórico"}
  e_organizations -- "1" --- r1
  r1 -- "N" --- e_credit_limit_changes
  r2{"é parcelado em"}
  e_orders -- "1" --- r2
  r2 -- "N" --- e_invoiced_installments
  r3{"dá baixa em"}
  e_users -- "0..1" --- r3
  r3 -- "N" --- e_invoiced_installments
  r4{"é faturado em"}
  e_orders -- "1" --- r4
  r4 -- "1" --- e_invoices
  r5{"é pago por"}
  e_orders -- "1" --- r5
  r5 -- "N" --- e_payments
  r6{"decide"}
  e_users -- "0..1" --- r6
  r6 -- "N" --- e_refunds
  r7{"é estornado em"}
  e_orders -- "1" --- r7
  r7 -- "N" --- e_refunds
  r8{"é devolvido em"}
  e_payments -- "0..1" --- r8
  r8 -- "N" --- e_refunds
  r9{"pede"}
  e_users -- "1" --- r9
  r9 -- "N" --- e_refunds
  classDef ext stroke-dasharray: 4 3
```

## Pós-venda e atendimento

```mermaid
flowchart LR
  e_support_tickets["Chamado"]
  e_support_ticket_events["Evento do chamado"]
  e_support_ticket_attachments["Anexo do chamado"]
  e_seller_rules["Regra de vendedor"]
  e_demo_requests["Demonstração"]
  e_organizations["Conta corporativa"]:::ext
  e_products["Produto"]:::ext
  e_users["Usuário"]:::ext
  e_orders["Pedido"]:::ext
  e_order_items["Item do pedido"]:::ext
  r0{"agenda"}
  e_organizations -- "0..1" --- r0
  r0 -- "N" --- e_demo_requests
  r1{"é demonstrado em"}
  e_products -- "0..1" --- r1
  r1 -- "N" --- e_demo_requests
  r2{"conduz"}
  e_users -- "0..1" --- r2
  r2 -- "N" --- e_demo_requests
  r3{"agenda"}
  e_users -- "1" --- r3
  r3 -- "N" --- e_demo_requests
  r4{"atende por"}
  e_users -- "1" --- r4
  r4 -- "N" --- e_seller_rules
  r5{"anexa"}
  e_support_tickets -- "1" --- r5
  r5 -- "N" --- e_support_ticket_attachments
  r6{"escreve"}
  e_users -- "0..1" --- r6
  r6 -- "N" --- e_support_ticket_events
  r7{"registra"}
  e_support_tickets -- "1" --- r7
  r7 -- "N" --- e_support_ticket_events
  r8{"origina"}
  e_orders -- "1" --- r8
  r8 -- "N" --- e_support_tickets
  r9{"é reclamado em"}
  e_order_items -- "1" --- r9
  r9 -- "N" --- e_support_tickets
  r10{"abre"}
  e_organizations -- "0..1" --- r10
  r10 -- "N" --- e_support_tickets
  r11{"abre"}
  e_users -- "1" --- r11
  r11 -- "N" --- e_support_tickets
  classDef ext stroke-dasharray: 4 3
```

## Plataforma e auditoria

```mermaid
flowchart LR
  e_settings["Configuração"]
  e_institutional_pages["Página institucional"]
  e_audit_logs["Log de auditoria"]
  e_email_outbox["E-mail"]
  e_rate_limit_buckets["Limite de tentativas"]
  e_users["Usuário"]:::ext
  r0{"executa"}
  e_users -- "0..1" --- r0
  r0 -- "N" --- e_audit_logs
  r1{"edita"}
  e_users -- "0..1" --- r1
  r1 -- "N" --- e_institutional_pages
  r2{"altera"}
  e_users -- "0..1" --- r2
  r2 -- "N" --- e_settings
  classDef ext stroke-dasharray: 4 3
```

