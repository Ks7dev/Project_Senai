# Auditoria de documentação — Atelier Bureau

Data: 18/11/2026 · Branch analisada: `perf/217-build-optimizations` (commit `2569c19`) · Modo: somente leitura.

Fontes comparadas: Levantamento de Requisitos v2.0 (58 RF, 24 RN e 16 RNF), `README.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `AGENTS.md`, `docs/*.md`, `docs/banco-de-dados/*`, `docs/pci/README.md` e `.env.example`, contra `app/`, `features/`, `components/`, `emails/`, `prisma/` (schema, 29 migrations e seed), `deploy/`, `docker-compose.yml`, `.github/workflows/` e `tests/`.

## Critério de status

- **Implementado:** há lógica no código (arquivo:linha) **e** teste automatizado que exercita a regra (unitário, de integração ou E2E) ou um gate automático equivalente (lint, CI).
- **Parcial:** a lógica existe, mas falta parte do requisito, falta teste ou a evidência exigida (medição, registro de teste manual, validação externa) não foi produzida.
- **Não implementado:** não há código que atenda ao requisito.
- **Não verificável:** o requisito é qualitativo ou depende de medição em produção que não pode ser comprovada pelo repositório.

Observação importante sobre os testes: os testes de `tests/integration/**` (MySQL real) são **excluídos** do `npm test` (`vitest.config.ts:16`) e **nenhum workflow** roda `npm run test:integration` (`.github/workflows/ci.yml:63` roda só `test:coverage`; `e2e.yml:78` roda só o Playwright). A evidência de integração citada na matriz existe no repositório, mas não é verificada no CI.

## 1. Resumo

| Grupo | Total | Implementado | Parcial | Não implementado | Não verificável |
|---|---|---|---|---|---|
| RF | 58 | 57 | 1 | 0 | 0 |
| RN | 24 | 23 | 1 | 0 | 0 |
| RNF | 16 | 8 | 7 | 0 | 1 |
| **Total** | **98** | **88** | **9** | **0** | **1** |

Parciais: RF33, RN22, RNF01, RNF02, RNF03, RNF04, RNF10, RNF11 e RNF13. Não verificável: RNF09.

O código cobre praticamente todo o levantamento de requisitos, com comentários que citam o requisito e testes com o código no título. Os problemas principais estão na **documentação de acompanhamento e de operação**, que ficou para trás em relação ao código: status das issues, documentos de banco de dados gerados, PCI-DSS, README e ARCHITECTURE.

## 2. Matriz de rastreabilidade

Legenda das colunas: **Documentação** = onde o requisito é descrito além do .docx (Issues = `docs/AtelierBureau_Issues.md`, DB = `docs/banco-de-dados/01-escopo.md`). **Evidência** = lógica principal; teste.

### 2.1 Requisitos funcionais

| Requisito | Documentação | Implementação | Status | Evidência |
|---|---|---|---|---|
| RF01 Navegação por categorias e subcategorias | Issues #23; DB §3 | Árvore de categorias, PLP por categoria com subárvore, admin de categorias | Implementado | `features/shared/lib/catalog/category-tree.ts:30`, `features/shared/lib/catalog/catalog-query.ts:227`, `features/catalog/categories/action/category-actions.ts:64`; `tests/catalog/category-tree.test.ts:17`, `tests/integration/category-navigation.test.ts:30` |
| RF02 Busca com filtros (marca, preço, material, especificação, prazo) | Issues #24, #25 | Filtros na URL (`marca`, `material`, `min`, `max`, `prazo`), busca FULLTEXT e por especificação | Implementado | `features/shared/lib/catalog/catalog-filters.ts:53`, `features/shared/lib/catalog/catalog-query.ts:74`, `:101`; `tests/catalog/catalog-filters.test.ts:14`, `tests/integration/actions.test.ts:443` |
| RF03 Ficha com especificações, PDF, garantia e certificações | Issues #26 | PDP com especificações, ficha técnica e manual em PDF, garantia, certificações | Implementado (cobertura indireta) | `features/catalog/product-page/product-page-view.tsx:262`, `:331-371`; `tests/a11y/components-a11y.test.tsx:273` (renderiza a PDP com ficha técnica; não afirma o conteúdo) |
| RF04 Comparação de até 4 produtos | Issues #27 | `MAX_COMPARE = 4` | Implementado | `features/shared/lib/compare/compare-store.ts:2`, `:104`; `tests/catalog/favorites-and-compare.test.ts:100` |
| RF05 Solicitar orçamento formal | Issues #48 | `requestQuote` | Implementado | `features/cart/quote-request/action/quote-request-actions.ts:276`; `tests/cart/quote-request.test.ts:22`, `tests/integration/quote-request.test.ts:75` |
| RF06 Número de cotação rastreável com validade | Issues #49 | `COT-AAAA-NNNNNN`, validade por setting | Implementado | `features/shared/lib/quotes/quote-number.ts:14`, `features/shared/lib/quotes/quote-validity.ts:41`; `tests/integration/quote-validity.test.ts:104` |
| RF07 Salvar carrinho como lista/projeto | Issues #46 | `saveCartAsProjectList`, `resumeProjectList` | Implementado | `features/cart/cart-page/action/cart-page-actions.ts:253`, `features/cart/project-lists/action/project-list-actions.ts:102`; `tests/integration/cart.test.ts:185` |
| RF08 Anexo na solicitação de orçamento | Issues #48 | Até 5 anexos PDF/imagem, tipo pelo conteúdo | Implementado | `features/shared/lib/quotes/quote-attachments.ts:17`, `:55`; `tests/cart/quote-request.test.ts:53` |
| RF09 Conta corporativa multiusuário com CNPJ via API | Issues #34 | BrasilAPI, recusa CNPJ inativo, razão social automática, convites | Implementado | `features/shared/lib/brasilapi/cnpj.ts:26`, `features/access/sign-up/action/sign-up.ts:92`, `features/access/corporate-members/action/members-actions.ts:129`; `tests/access/corporate-accounts.test.ts:72`, `tests/access/members-actions.test.ts:71` |
| RF10 Perfis da conta corporativa | Issues #35; ARCHITECTURE §4 | Solicitante, aprovador, financeiro, administrador (em `members.role`) | Implementado | `features/shared/lib/auth/corporate-roles.ts:2`, `:21`; `tests/access/corporate-accounts.test.ts:9` |
| RF11 Roteamento para aprovador (RN01) com registro | Issues #51 | Status `AWAITING_APPROVAL`, `order_approvals` | Implementado | `features/payment/checkout/action/checkout-actions.ts:749-755`, `features/orders/order-approval/action/order-approval-actions.ts:214`; `tests/integration/order-approval.test.ts:120` |
| RF12 Faturado a prazo com boleto próprio | Issues #60 | Parcelas com nosso número e linha digitável fictícia | Implementado | `features/shared/lib/invoiced/invoiced-billing.ts:48`, `features/shared/lib/invoiced/invoiced-math.ts:178`; `tests/finance/invoiced.test.ts:112` |
| RF13 NF-e automática com XML, DANFE e chave | Issues #63 | Fila na transição para `PAID`, job a cada minuto com retentativas | Implementado (ver achado 8.1) | `features/shared/lib/orders/order-lifecycle.ts:125-133`, `features/shared/lib/nfe/nfe-service.ts:60`, `:532`; `tests/finance/nfe.test.ts:316` |
| RF14 Parcelas por faixa de valor e perfil | Issues #56 | `payment.installment_rules`, editável em `/admin/parcelamento` | Implementado | `features/payment/installments/action/installment-actions.ts:81`, `features/shared/lib/payments/installment-rules.ts:22`; `tests/payment/installments.test.ts:18`, `tests/integration/payment.test.ts:883` |
| RF15 Rastreamento com status detalhado | Issues #66 | Linha do tempo do pedido | Implementado | `features/shared/lib/orders/order-timeline.ts:116`, `features/orders/order-tracking/action/order-tracking-actions.ts:128`; `tests/integration/order-tracking.test.ts:85` |
| RF16 Agendamento de entrega/instalação | Issues #53 | Calendário com capacidade diária e bloqueio por lock | Implementado | `features/shared/lib/delivery/installation-calendar.ts:235`, `features/shared/lib/delivery/installation-schedule.ts:97`; `tests/integration/installation-schedule.test.ts:198` |
| RF17 Chamado de garantia vinculado ao produto | Issues #68 | Chamados com anexos e histórico | Implementado | `features/after-sales/support-tickets/action/support-ticket-actions.ts:281`; `tests/after-sales/support-tickets.test.ts:28` |
| RF18 WhatsApp com vendedor dedicado na PDP e no carrinho | Issues #69 | Link `/atendimento` na PDP e no carrinho | Implementado | `features/catalog/product-page/product-page-view.tsx:236`, `features/cart/cart-page/cart-view.tsx:220`, `features/shared/lib/sellers/seller-routing.ts:111`; `tests/after-sales/seller-routing.test.ts:129`, `:205` |
| RF19 Agendamento de demonstração | Issues #70 | Agenda com horários e capacidade | Implementado | `features/after-sales/demo-scheduling/action/demo-scheduling-actions.ts:143`; `tests/after-sales/demo-scheduling.test.ts:37` |
| RF20 Comercial responde e converte cotações | Issues #50 | Fila, resposta, conversão em pedido | Implementado | `features/cart/quote-management/action/quote-management-actions.ts:554`, `:723`; `tests/integration/quote-management.test.ts:172`, `:444` |
| RF21 Tabela de preços por cliente/segmento | Issues #52 | `price_tables` por organização ou cliente | Implementado | `features/cart/price-tables/action/price-table-actions.ts:297`, `:426`, `features/shared/lib/pricing/customer-pricing.ts:73`; `tests/cart/price-tables.test.ts:70`, `tests/integration/price-tables.test.ts:74` |
| RF22 Endereço pelo CEP (ViaCEP) | Issues #39 | `lookupCep` | Implementado | `features/shared/lib/viacep/viacep.ts:57`; `tests/shipping/viacep.test.ts:60`, `tests/integration/shipping.test.ts:74` |
| RF23 Edição manual do endereço | Issues #39 | Campos editáveis após a consulta | Implementado | `features/shared/lib/viacep/use-cep-lookup.ts:56`; `tests/shipping/viacep.test.ts:60` |
| RF24 Validação do CEP (8 dígitos) | Issues #39 | Validação antes da chamada | Implementado | `features/shared/lib/viacep/viacep.ts:57`; `tests/shipping/viacep.test.ts:36` |
| RF25 Frete automático por modalidade (RN20) | Issues #40, #41 | Estratégias Correios, transportadora e entrega própria | Implementado | `features/shared/lib/shipping/strategies.ts:323`, `features/shared/lib/correios/correios.ts:321`; `tests/shipping/shipping-strategies.test.ts:165`, `tests/shipping/correios.test.ts:136` |
| RF26 Vários endereços por conta corporativa | Issues #36 | `addresses.organization_id` | Implementado | `prisma/schema.prisma:485-512`, `features/account/addresses/action/address-actions.ts:111`; `tests/account/account-area.test.ts:72` |
| RF27 Indicar cobertura de entrega própria | Issues #43 | `coverageOf` | Implementado | `features/shared/lib/shipping/strategies.ts:305`; `tests/shipping/regions.test.ts:82` |
| RF28 Payment Brick embutido | Issues #54 | SDK v2 só na página de pagamento | Implementado | `features/shared/lib/mercadopago/bricks.ts`, `features/payment/order-payment/order-payment-view.tsx:362`; `tests/integration/payment.test.ts:512` |
| RF29 Cartão, Pix e boleto | Issues #55 | Brick com os três meios | Implementado | `features/payment/order-payment/action/payment-actions.ts:456`; `tests/payment/pix-boleto.test.ts:55`, `tests/integration/payment.test.ts:723` |
| RF30 Webhook do Mercado Pago | Issues #57 | Assinatura, idempotência por `x-request-id`, releitura | Implementado | `app/api/webhooks/mercadopago/route.ts:41`, `features/shared/lib/mercadopago/mercadopago.ts:440`; `tests/payment/webhook.test.ts:21`, `tests/integration/payment.test.ts:1065` |
| RF31 Status do pagamento em tempo real | Issues #58; ARCHITECTURE §3 | Polling de 5 s por `setInterval` | Implementado (ver achado 3.2) | `features/payment/order-payment/order-payment-view.tsx:27`, `:282`, `features/payment/order-payment/action/payment-actions.ts:590`; `tests/integration/payment.test.ts:1234` |
| RF32 `payment_id` vinculado ao pedido | Issues #58; DB §5 | Coluna `UNIQUE` em `payments` | Implementado | `prisma/schema.prisma:904`; `tests/integration/payment.test.ts:1234` |
| RF33 Faturado 28/56 com vencimentos e baixa manual ou por retorno bancário | Issues #60 | Parcelas, estado `OVERDUE`, baixa manual com método `BANK_RETURN` | **Parcial** | `features/finance/invoiced-billing/action/invoiced-billing-actions.ts:288`, `features/shared/lib/invoiced/invoiced-math.ts:21-23`; `tests/finance/invoiced.test.ts:76`, `:175`. O "retorno bancário" é só um rótulo escolhido na baixa manual; não há leitura de arquivo de retorno (CNAB) |
| RF34 Estorno total ou parcial via API | Issues #59 | `createMercadoPagoRefund`, regras RN07/RN18/RN22 | Implementado | `features/shared/lib/mercadopago/mercadopago.ts:531`, `features/shared/lib/refunds/refund-rules.ts:250`, `features/finance/refunds/action/refund-actions.ts:738`; `tests/finance/refunds.test.ts:112`, `:393` |
| RF35 Tokenização no front-end | Issues #54; PCI §2.2 | Schema recusa dados de cartão | Implementado | `features/payment/order-payment/schema/payment-schema.ts`; `tests/payment/payment-schemas.test.ts:24` |
| RF36 `POST /v1/payments` com o token | Issues #54 | `createMercadoPagoPayment` | Implementado | `features/shared/lib/mercadopago/mercadopago.ts:400`; `tests/payment/mercadopago.test.ts:191` |
| RF37 3DS2 pelo Bricks | Issues #54 | `three_d_secure_mode: "optional"` e desafio no Status Screen Brick | Implementado (só com mock) | `features/payment/order-payment/action/payment-actions.ts:383`, `:568`; `tests/integration/payment.test.ts:604`, `tests/payment/mercadopago.test.ts:101` |
| RF38 Fallback do ViaCEP | Issues #39 | Timeout e digitação manual | Implementado | `features/shared/lib/viacep/viacep.ts:35`; `tests/shipping/viacep.test.ts:60` |
| RF39 Cadastro e login PF e PJ | Issues #32 | Fluxos e validação de CPF/CNPJ distintos | Implementado | `features/access/sign-up/action/sign-up.ts:66`, `features/access/sign-in/action/sign-in.ts:31`; `tests/access/auth-actions.test.ts:76`, `tests/integration/actions.test.ts:106` |
| RF40 Recuperação de senha, hash e 2FA opcional | Issues #33, #177 | Better Auth, TOTP; 2FA obrigatório para perfis internos financeiros | Implementado | `features/access/password-reset/action/password-reset.ts:25`, `features/access/security/action/two-factor.ts:121`, `features/shared/lib/auth/permissions.ts:158`; `tests/access/auth-actions.test.ts:181`, `tests/integration/actions.test.ts:363`, `tests/access/mandatory-two-factor.test.ts:102` |
| RF41 Cadastro completo de produto (inclui edição limitada/lote) | Issues #21 | `saveProduct`, `limited_edition`, `lot_number` | Implementado | `features/catalog/products-admin/action/product-actions.ts:214`, `prisma/schema.prisma:558-559`; `tests/catalog/product-rules-and-images.test.ts:71`, `tests/integration/product-publish.test.ts:76` |
| RF42 Inativar sem perder histórico | Issues #28 | `setProductStatus` | Implementado | `features/catalog/products-admin/action/product-actions.ts:375`; `tests/catalog/import-and-inactivation.test.ts:87` |
| RF43 Estoque: reserva, baixa, liberação e reposição | Issues #64 | `SELECT ... FOR UPDATE`, razão de estoque | Implementado | `features/shared/lib/stock/stock-service.ts:29`, `:84`, `:166`, `:206`, `:243`; `tests/integration/stock.test.ts:74`, `:260` |
| RF44 Bloquear ou sinalizar sob encomenda | Issues #64, #26 | Disponível = físico − reservas; aviso "Sob encomenda" | Implementado | `features/catalog/product-page/product-page-view.tsx:54`, `:219`; `tests/orders/stock-math.test.ts:12` |
| RF45 Favoritos | Issues #38 | `setFavorite` | Implementado | `features/shared/lib/favorites/favorite-actions.ts:43`; `tests/catalog/favorites-and-compare.test.ts:50` |
| RF46 Promoções (percentual/fixo, frete cortesia, produto/categoria/cupom, vigência) | Issues #73 | `promotions` com `scope`, `discount_type`, `free_shipping`, `starts_at`/`ends_at` | Implementado | `prisma/schema.prisma:172-183`, `features/backoffice/promotions/action/promotion-actions.ts:212`, `features/shared/lib/promotions/promotion-service.ts:111`; `tests/backoffice/promotions.test.ts:67`, `:96` |
| RF47 Carrossel editável na home | Issues #30 | Setting `content.home`, upload de imagem | Implementado | `features/backoffice/home-content/action/home-content-actions.ts:50`, `:98`; `tests/catalog/import-and-inactivation.test.ts:107` |
| RF48 Importação CSV com relatório de erros | Issues #29 | `importProducts`, até 1.000 linhas | Implementado (ver RNF04) | `features/catalog/products-admin/action/import-products.ts:35`, `features/catalog/products-admin/schema/import-schema.ts:2`; `tests/catalog/import-and-inactivation.test.ts:44` |
| RF49 Agregador de transportadoras | Issues #42 | `quoteCarrier` | Implementado | `features/shared/lib/carrier/carrier.ts:161`; `tests/shipping/carrier.test.ts:126`, `tests/integration/shipping.test.ts:689` |
| RF50 Entrega própria por faixa de CEP e peso | Issues #43 | `shipping_regions` editável em `/admin/frete` | Implementado | `features/shipping/regions/action/region-actions.ts:123`, `features/shared/lib/shipping/strategies.ts:172`; `tests/shipping/regions.test.ts:19`, `tests/shipping/shipping-strategies.test.ts:304` |
| RF51 Personalização (gravação) | Issues #47 | Setting `personalization.engraving` | Implementado | `features/shared/lib/cart/cart-extras.ts:108`, `features/cart/cart-page/action/cart-page-actions.ts:177`; `tests/cart/cart-extras.test.ts:55`, `tests/integration/cart.test.ts:291` |
| RF52 Serviços adicionais no carrinho | Issues #47 | Setting `cart.additional_services` com `courtesy` | Implementado | `prisma/seed-data.ts:164-180`, `features/shared/lib/cart/cart-extras.ts:66`; `tests/cart/cart-extras.test.ts:55` |
| RF53 E-mails transacionais | Issues #67 | 15 modelos e fila com retentativas | Implementado | `emails/templates.ts:76-505`, `features/shared/lib/email/mailer.ts:72`, `:163`; `tests/emails/email-templates.test.ts:63`, `tests/integration/emails.test.ts:83` |
| RF54 Ciclo de vida único com data e responsável | Issues #65 | 12 status e transições; `order_status_history.changed_by_id` | Implementado (ver achado 2.1) | `features/shared/lib/orders/order-status.ts:51-76`, `features/shared/lib/orders/order-lifecycle.ts:89`; `tests/orders/order-status.test.ts:13`, `tests/integration/order-lifecycle.test.ts:86` |
| RF55 Usuários internos e permissões por módulo | Issues #72 | RBAC em `roles`/`permissions` | Implementado | `features/backoffice/internal-users/action/internal-users-actions.ts:100`, `features/shared/lib/db/permissions.ts:37`, `:60`; `tests/shared/permissions.test.ts:51`, `tests/integration/internal-users.test.ts:53` |
| RF56 LGPD: cookies, consulta, exportação, anonimização | Issues #75 | Consentimento, exportação e anonimização na conta e no admin | Implementado | `features/shared/lib/privacy/consent.ts:57`, `features/account/privacy/action/privacy-actions.ts:33`, `:78`, `features/shared/lib/privacy/personal-data.ts:296`; `tests/backoffice/privacy.test.ts:90`, `:134`, `:221` |
| RF57 Páginas institucionais editáveis | Issues #74 | `institutional_pages` | Implementado | `features/backoffice/institutional-pages/action/institutional-page-actions.ts:63`; `tests/backoffice/institutional-pages.test.ts:14` |
| RF58 Financeiro aprova crédito e limite com histórico | Issues #61 | `credit_limit_changes` | Implementado | `features/finance/credit-approval/action/credit-approval-actions.ts:148`; `tests/finance/credit.test.ts:107`, `:153` |

### 2.2 Regras de negócio

| Requisito | Documentação | Implementação | Status | Evidência |
|---|---|---|---|---|
| RN01 Aprovação acima de R$ 10.000 (configurável), aprovador ≠ solicitante | DB §3.1; Políticas | `order.approval_limit` (>), `canDecideOrderApproval` | Implementado (ver achado 3.1: não editável no back office) | `features/payment/checkout/action/checkout-actions.ts:749-751`, `features/shared/lib/auth/corporate-roles.ts:80`; `tests/orders/order-approval.test.ts:67`, `tests/integration/order-approval.test.ts:120` |
| RN02 Validade de 15 dias e revalidação | DB §3.1 | `quote.validity_days`, job `expire-quotes`, revalidação | Implementado | `features/shared/lib/quotes/quote-validity.ts:41`, `features/shared/lib/quotes/quote-revalidation.ts:75`, `features/shared/lib/jobs/app-jobs.ts:50`; `tests/cart/quote-validity.test.ts:11` |
| RN03 Faturado 28/56 só para conta aprovada | DB §3.1 | `payment.invoiced_due_days = [28, 56]`, checagem de crédito | Implementado | `prisma/seed-data.ts:100-101`, `features/payment/checkout/action/checkout-actions.ts:741-743`; `tests/finance/invoiced.test.ts:76` |
| RN04 Desconto por volume por categoria | Issues #52 | `volume_discounts.category_id` com mínimo de quantidade ou valor | Implementado | `prisma/schema.prisma:1181`, `features/shared/lib/pricing/pricing-math.ts:181`; `tests/cart/price-tables.test.ts:153` |
| RN05 Instalação obrigatória exige agendamento | Issues #53 | Data exigida no checkout | Implementado | `features/payment/checkout/action/checkout-actions.ts:146-148`; `tests/orders/installation-calendar.test.ts:26`, `tests/integration/installation-schedule.test.ts:198` |
| RN06 Garantia estendida acima de R$ 5.000 (configurável) | DB §3.1 | `includesExtendedWarranty` | Implementado (ver achado 3.1) | `features/shared/lib/catalog/product-rules.ts:9`; `tests/catalog/product-rules-and-images.test.ts:23` |
| RN07 Cancelamento de faturado exige financeiro; multa PJ | Políticas | `refundNeedsApproval`; `INVOICED` não vai para `CANCELED` | Implementado (multa informada à mão, sem cálculo) | `features/shared/lib/refunds/refund-rules.ts:200`, `features/shared/lib/orders/order-status.ts:70`; `tests/finance/refunds.test.ts:112` |
| RN08 Conta multiusuário com aprovador; usuário único acumula perfis | Issues #35 | `applyApproverRule` | Implementado | `features/shared/lib/auth/corporate-roles.ts:101`; `tests/access/corporate-accounts.test.ts:34`, `tests/access/members-actions.test.ts:104` |
| RN09 Certificação obrigatória para publicar | Issues #21 | `publishBlocker` | Implementado | `features/shared/lib/catalog/product-rules.ts:33`; `tests/catalog/product-rules-and-images.test.ts:28`, `tests/integration/product-publish.test.ts:76` |
| RN10 Limite de crédito bloqueia faturado | Issues #61 | `checkInvoicedCredit` | Implementado | `features/shared/lib/credit/credit-math.ts:85`; `tests/finance/credit.test.ts:47`, `:256` |
| RN11 Vendedor por região/segmento, não alterável pelo cliente | Issues #69 | `pickSellerRule`, atribuição só no admin | Implementado | `features/shared/lib/sellers/seller-routing.ts:82`, `features/after-sales/seller-routing/action/seller-routing-actions.ts:257`; `tests/after-sales/seller-routing.test.ts:75` |
| RN12 PJ: sem troca de personalizados, salvo defeito | Políticas | `checkReturnEligibility` | Implementado | `features/shared/lib/support/return-policy.ts:80`, `:160`; `tests/after-sales/returns-withdrawal.test.ts:122` |
| RN13 Confirmação só com `approved`; faturado pelo financeiro | ARCHITECTURE §3 | `mapProviderStatus`, `confirmInvoicedOrder` | Implementado | `features/shared/lib/mercadopago/mercadopago.ts:183`, `features/finance/invoiced-billing/action/invoiced-billing-actions.ts:400`; `tests/payment/mercadopago.test.ts:137`, `tests/finance/invoiced.test.ts:266` |
| RN14 Reserva; Pix 30 min e boleto 3 dias úteis | DB §3.1 | `paymentExpiresAt`, job `expire-unpaid-orders` | Implementado | `features/shared/lib/payments/payment-deadlines.ts:41`, `features/shared/lib/orders/order-expiration.ts:74`; `tests/payment/pix-boleto.test.ts:29`, `tests/integration/payment.test.ts:723` |
| RN15 Recotação de frete ao mudar endereço | Issues #45 | `quoteAddressChange`, `confirmAddressChange` | Implementado | `features/orders/address-change/action/address-change-actions.ts:453`, `:523`; `tests/orders/address-change.test.ts:14`, `tests/integration/address-change.test.ts:177` |
| RN16 Cobertura RMSP por faixas de CEP; fora dela, cotação manual | Issues #43, #44 | `shipping_regions`, fila de cotação manual | Implementado | `features/shipping/regions/action/region-actions.ts:123`, `features/shared/lib/shipping/manual-quote.ts:72`; `tests/integration/shipping.test.ts:302`, `:423` |
| RN17 Faturado não passa pelo Mercado Pago | Issues #60 | Confirmação sem chamada ao MP | Implementado | `features/payment/checkout/action/checkout-actions.ts:758`; `tests/finance/invoiced.test.ts:266` |
| RN18 Prazo de estorno (MP e política) | DB §3.1 | `refund.max_days_after_payment = 180` | Implementado | `features/shared/lib/refunds/refund-rules.ts:352`; `tests/finance/refunds.test.ts:112` |
| RN19 PCI-DSS SAQ A | PCI SAQ A | Sem dado de cartão no backend, CSP com nonce | Implementado (com pendências formais P2 e P6 do SAQ) | `features/shared/lib/security/headers.ts:152`; `tests/payment/payment-schemas.test.ts:24`, `tests/shared/payment-page-csp.test.ts:39` |
| RN20 Correios até 30 kg / 100 cm / 200 cm; senão transportadora; senão manual | DB §3.1 | `fitsCorreios`, estratégias, cotação manual | Implementado | `features/shared/lib/shipping/volumes.ts:106`, `features/shared/lib/shipping/strategies.ts:140`; `tests/shipping/shipping-strategies.test.ts:145`, `:165` |
| RN21 Falha do ViaCEP não bloqueia | Issues #39 | Fallback manual | Implementado | `features/shared/lib/viacep/viacep.ts:57`; `tests/shipping/viacep.test.ts:60` |
| RN22 Arrependimento PF em 7 dias; personalizados PF a validar juridicamente | Políticas | Prazo e flag `legal_review` | **Parcial** | `features/shared/lib/support/return-policy.ts:22`, `:126`, `features/shared/lib/refunds/refund-rules.ts:189`; `tests/after-sales/returns-withdrawal.test.ts:48`. A validação jurídica exigida pela regra (issue #4) segue "Em andamento" em `docs/AtelierBureau_Issues.md` |
| RN23 Frete cortesia por promoção ou mínimo por região | Issues #73 | `free_shipping`, `shipping_regions.free_shipping_minimum` | Implementado | `features/shared/lib/promotions/promotion-service.ts:175`, `:197`; `tests/backoffice/promotions.test.ts:240` |
| RN24 Personalizados não cancelam após início da produção | Issues #47 | `canCancelOrderItem` | Implementado | `features/shared/lib/orders/cancellation.ts:40`; `tests/cart/cart-extras.test.ts:140` |

### 2.3 Requisitos não funcionais

| Requisito | Documentação | Implementação | Status | Evidência |
|---|---|---|---|---|
| RNF01 Uptime ≥ 99%, monitoramento e alertas | Monitoramento; ARCHITECTURE §5.1 | Healthchecks, `GET /api/health`, Uptime Kuma | **Parcial** | `app/api/health/route.ts:12`, `docker-compose.yml:130-139`; `tests/shared/health.test.ts:9`. O registro do teste de alerta (`docs/AtelierBureau_Monitoramento.md:87-89`) está vazio; o 99% não é medido |
| RNF02 Estabilidade sob 3x o tráfego médio | Performance §2 | `scripts/load-test.ts` | **Parcial** | `tests/perf/load-test.test.ts:42`. O próprio doc diz que a execução real está pendente (`docs/AtelierBureau_Performance.md:72-73`) |
| RNF03 LGPD: criptografia em trânsito e em repouso, acesso por perfil | ARCHITECTURE §5; DB §7 | AES-256-GCM só em `users.document`, `users.phone`, `demo_requests.phone`; TLS app→MySQL | **Parcial** | `features/shared/lib/crypto/personal-data-cipher.ts:74`; `tests/privacy/personal-data-cipher.test.ts:13`, `tests/integration/personal-data-encryption.test.ts:23`. E-mail, nome, endereços e IPs ficam em claro; o backup não é cifrado (`deploy/backup/backup.sh:23`; `docs/AtelierBureau_Politica_Seguranca.md:80-82`) |
| RNF04 JPG/PNG/WebP no cadastro e **via CSV**, WebP ≤ 300 KB e versões responsivas | ARCHITECTURE §1 | `processProductImage` no cadastro manual | **Parcial** | `features/shared/lib/images/process-image.ts:6-12`, `:34`; `tests/catalog/product-rules-and-images.test.ts:100`. O CSV não tem coluna de imagem (`features/catalog/products-admin/schema/import-schema.ts:2-18`) |
| RNF05 Sem vazamento de estrutura; autenticação, autorização, rate limit | ARCHITECTURE §3, §4 | `toActionError`, `requirePermission`, rate limit em memória e persistente | Implementado | `features/shared/lib/errors/action-result.ts:8`, `features/shared/lib/db/permissions.ts:60`, `features/shared/lib/rate-limit/rate-limit.ts:79`, `features/shared/lib/rate-limit/persistent-limit.ts:171`; `tests/shared/errors-logs-rate-limit.test.ts:57`, `tests/shared/permissions.test.ts:168`, `tests/shared/persistent-rate-limit.test.ts:150` |
| RNF06 Só HTTPS, sem fallback | ARCHITECTURE §5.1 | Caddy `redir ... 308`, HSTS | Implementado | `deploy/caddy/Caddyfile:14-15`, `features/shared/lib/security/headers.ts:185`; `tests/shared/security-headers.test.ts:49` |
| RNF07 MVC modular com testes | ARCHITECTURE §2 | Features/action/schema; cobertura mínima no CI | Implementado (ver achado 8.3) | `vitest.config.ts:20-40`, `.github/workflows/ci.yml:63`; 89 arquivos de teste (20 de integração) |
| RNF08 Documentação de cada função | Guia de documentação | `eslint-plugin-jsdoc` com `require-jsdoc` | Implementado | `eslint.config.mjs:14-31`, `.github/workflows/ci.yml:56` |
| RNF09 Componentes e utilitários reaproveitáveis | ARCHITECTURE §2 | `components/ui`, `components/commerce`, `features/shared/` | **Não verificável** | Estrutura presente, e não há import entre features (verificado por busca). Não há gate automático contra duplicação |
| RNF10 LCP ≤ 2,5 s e p95 ≤ 500 ms | Performance | Orçamento de bundle no CI; script de latência | **Parcial** | `performance-budget.json`, `scripts/api-latency.ts`, `.github/workflows/ci.yml:78`; `tests/perf/performance-budget.test.ts:18`. Nenhuma medição de LCP ou p95 registrada |
| RNF11 Backup diário, 30 dias, RPO 24 h, RTO 4 h, teste documentado | Backup e Restauração | Container `backup`, scripts de restauração | **Parcial** | `deploy/backup/backup.sh:2`, `deploy/backup/restore.sh:3`. O registro do teste de restauração está vazio (`docs/AtelierBureau_Backup_Restauracao.md:122-126`) |
| RNF12 Auditoria com usuário, data, IP e valores | Issues #76; gatilhos | `writeAudit` em 37 módulos; gatilho impede alteração | Implementado | `features/shared/lib/db/audit.ts:38`; `tests/backoffice/audit-log.test.ts:55`, `tests/integration/database-triggers.test.ts:46` |
| RNF13 WCAG 2.1 AA | Acessibilidade | axe-core, contraste dos tokens, teclado no E2E | **Parcial** | `tests/a11y/components-a11y.test.tsx:165`, `tests/design/tokens.test.ts:80`, `tests/e2e/purchase-flow.spec.ts:148`. O teste humano com leitor de tela está pendente (`docs/AtelierBureau_Acessibilidade.md:24-26`) |
| RNF14 SEO | Issues #31 | Sitemap, robots, JSON-LD de produto | Implementado | `features/shared/lib/seo/product-json-ld.ts:84`, `features/shared/lib/seo/sitemap.ts:80`, `app/robots.ts`; `tests/seo/seo.test.ts:42`, `:127` |
| RNF15 Tokens únicos e breakpoints | Identidade Visual | `app/tokens.css`, fontes Playfair Display e Plus Jakarta Sans | Implementado | `app/tokens.css:2`, `:183`, `app/layout.tsx:2`; `tests/design/tokens.test.ts:80` |
| RNF16 MySQL 8 + Prisma + Docker + TLS | ARCHITECTURE §5 | 29 migrations, 20 gatilhos, `DATABASE_TLS=required` | Implementado (ver achado 3.4) | `prisma/schema.prisma:1`, `features/shared/lib/db/connection-config.ts:11`, `docker-compose.yml:62-91`; `tests/database/connection-config.test.ts:9`, `tests/integration/database-triggers.test.ts:46` |

## 3. Achados por categoria

Severidade: **Alta** (engana quem opera ou avalia o sistema, ou toca em segurança), **Média** (divergência que leva a decisão errada ou retrabalho), **Baixa** (desatualização pontual).

### Categoria 1 — Documentado, mas não implementado

**1.1 (Média) Armazenamento S3-compatível.** `ARCHITECTURE.md:16` ("num armazenamento S3-compatível (disco local em dev)") e `docs/banco-de-dados/01-escopo.md` §4 ("Armazenamento S3-compatível"). O código só grava em disco local: `features/shared/lib/storage/storage.ts:12-15` (`STORAGE_DIR`). Não há cliente S3 nem variável no `.env.example`.
Recomendação: trocar o texto por "disco local (volume Docker), pela interface de `features/shared/lib/storage/storage.ts`".

**1.2 (Média) Bibliotecas citadas na stack e não instaladas.** `ARCHITECTURE.md:11` cita `framer-motion` e `next-themes`, e `ARCHITECTURE.md:15` cita `@tanstack/react-table` v9 e `@tanstack/react-query` v5. Nenhuma está no `package.json` nem é importada.
Recomendação: remover da tabela de stack ou registrar que foram descartadas.

**1.3 (Baixa) Pasta `hooks/`.** `ARCHITECTURE.md:35` cita `lib/, hooks/`, mas `hooks/` não existe. O único hook (`useCepLookup`) está em `features/shared/lib/viacep/use-cep-lookup.ts:56`.
Recomendação: remover `hooks/` ou documentar onde ficam os hooks.

**1.4 (Média) READMEs obrigatórios das integrações.** `docs/AtelierBureau_Guia_Documentacao.md:60` diz que as integrações em `features/shared/lib/<integracao>/` "sempre têm `README.md`". Não há nenhum `README.md` em `features/` (Mercado Pago, Correios, transportadora, ViaCEP, BrasilAPI, NF-e).
Recomendação: criar os READMEs ou mudar a regra para "JSDoc no módulo".

**1.5 (Alta) `require_secure_transport=ON` no MySQL.** `ARCHITECTURE.md:100` e `docs/AtelierBureau_Politica_Seguranca.md:53` afirmam que o MySQL exige TLS por `require_secure_transport=ON`. O `docker-compose.yml:83-91` não passa essa flag. Só o usuário `dev` tem `REQUIRE SSL` (`deploy/mysql/init/01-users.sh:29`). `atelier_app`, `atelier_migrate` e `atelier_backup` são `'%'` sem `REQUIRE SSL` (`01-users.sh:8-21`). O TLS do app é só do lado cliente (`DATABASE_TLS=required`, sem verificar a cadeia).
Recomendação: adicionar `--require-secure-transport=ON` (ou `REQUIRE SSL` nos usuários) por migration de infraestrutura, ou corrigir os dois documentos. Isso pesa mais se `MYSQL_PUBLISH_ADDR=0.0.0.0` for usado.

**1.6 (Média) Configuração das regras "no back office".** O .docx (§1.1: "Ambos configuráveis no back office") e `docs/banco-de-dados/01-escopo.md` §3.1 ("carregados pelo `prisma/seed.ts` e editados no back office") prometem edição pelo admin. Só `payment.installment_rules` (`features/payment/installments/action/installment-actions.ts:99`) e `content.home` (`features/backoffice/home-content/action/home-content-actions.ts:66`) são editáveis. `order.approval_limit` (RN01), `product.extended_warranty_threshold` (RN06), prazos de Pix e boleto (RN14), `quote.validity_days` (RN02), limites dos Correios (RN20), prazos de estorno, instalação e demonstração só mudam pelo seed ou direto no banco, e alterar o banco à mão é proibido pelo `CLAUDE.md` §7.
Recomendação: criar uma tela "Configurações" com `setting:manage`, que já existe em `features/shared/lib/auth/permissions.ts`, ou registrar a decisão e corrigir o .docx e o escopo.

### Categoria 2 — Implementado, mas não documentado

**2.1 (Média) Status extras do pedido.** O RF54 lista 10 status. O código tem 12: `AWAITING_SHIPPING_QUOTE` e `IN_PRODUCTION` (`prisma/schema.prisma:69-82`, `features/shared/lib/orders/order-status.ts:51-76`). Nem o .docx nem a issue #65 (`docs/AtelierBureau_Issues.md:1475-1490`) os registram. O `CLAUDE.md` §11 exige registrar escopo alterado no .docx com NC.
Recomendação: atualizar o RF54 no .docx (nova NC) e a issue #65.

**2.2 (Média) Tabela `rate_limit_buckets` fora da documentação do banco.** Migration `20261117120000_rate_limit_buckets` e `prisma/schema.prisma:1257`. As descrições já estão em `scripts/db-docs/descriptions.ts:308`, `:714-719`, mas `npm run db:docs` não foi rodado: a tabela não aparece em `02-der.md`, `03-mer.md`, `04-dicionario-de-dados.md` nem `06-script.sql`.
Recomendação: rodar `npm run db:docs` e versionar o diff, como manda o `docs/banco-de-dados/README.md`.

**2.3 (Baixa) Route Handlers fora de `app/api/webhooks`.** `CLAUDE.md` §5 e `ARCHITECTURE.md` §2 (Controller "só para webhooks") não citam `app/media/[...key]/route.ts`, `app/admin/nfe/[id]/[arquivo]/route.ts` e `app/admin/produtos/importar/modelo/route.ts`. `/api/health` e `/api/csp-report` aparecem no ARCHITECTURE.
Recomendação: listar esses handlers de download no §2 do ARCHITECTURE, com a regra de autorização de cada um.

**2.4 (Baixa) Server Actions em `features/shared/lib`.** `cart-actions.ts`, `favorite-actions.ts`, `shipping-actions.ts` e `cep-actions.ts` têm `"use server"` fora de `action/`. O padrão documentado é `features/<dominio>/<feature>/action/`.
Recomendação: documentar a exceção (actions compartilhadas) no ARCHITECTURE §2.

**2.5 (Baixa) Settings não listados.** `01-escopo.md` §3.1 omite `content.home` (`features/shared/lib/content/home-content.ts:51`) e `security.payment_attempts_per_order`, `security.payment_attempts_per_ip` e `security.refund_requests_per_user` (`features/shared/schema/rate-limit-schema.ts:25-27`).
Recomendação: acrescentar os grupos "Conteúdo" e "Segurança" na tabela.

**2.6 (Baixa) Variável `PAYMENT_CHECK_COOKIE`.** Usada em `scripts/check-payment-page.ts:37` e ausente do `.env.example`.
Recomendação: incluir no `.env.example`, comentada, como opcional.

**2.7 (Baixa) Scripts npm sem documentação no README.** `perf:budget`, `perf:api`, `perf:load`, `security:payment-page`, `db:validate` e `db:docs` (`package.json`) não estão na tabela de scripts do `README.md`.

### Categoria 3 — Divergência entre documentação e comportamento

**3.1 (Média)** Ver 1.6: a configuração "no back office" das RN01/RN06/RN14 não existe.

**3.2 (Baixa) Mecanismo do "tempo real".** `ARCHITECTURE.md:61` diz que o RF31 usa `refetchInterval` do React Query. O código usa `setInterval` de 5 s (`features/payment/order-payment/order-payment-view.tsx:27`, `:282-290`).

**3.3 (Média) Perfis corporativos fora das tabelas de RBAC.** `ARCHITECTURE.md` §4 descreve RBAC por `roles`, `permissions`, `role_permissions` e `user_roles` e diz que "permissão nova nasce numa migration ou no seed", com dois conjuntos de perfis. Os perfis corporativos e as permissões deles são uma constante no código (`features/shared/lib/auth/corporate-roles.ts:21-26`), gravada como texto em `members.role`. Só os perfis internos usam as tabelas.
Recomendação: explicitar no §4 que o RBAC corporativo é estático em código.

**3.4 (Alta)** Ver 1.5: TLS obrigatório do MySQL. O `CLAUDE.md` §8 também diz "O MySQL aceita só usuários nomeados, restritos à sub-rede e com TLS", mas os três usuários do app são `'%'` sem TLS obrigatório.

**3.5 (Média) Permissão da baixa de parcela.** `settleInstallment` exige `payment:refund` (`features/finance/invoiced-billing/action/invoiced-billing-actions.ts:279`, `:383`). Baixa de recebível não é estorno, e não há permissão documentada para isso. Um perfil com estorno ganha também a baixa.
Recomendação: criar `receivable:settle` (ou documentar o reuso) no seed e no ARCHITECTURE.

**3.6 (Média) Serviços do Docker no README e no CLAUDE.md.** `README.md` ("Serviços: `proxy`, `app`, `db` e `backup`"; firewall só 80/443) e `CLAUDE.md` §8 omitem `uptime-kuma` (porta 3001), `webhook-gate` e `tunnel` (`docker-compose.yml:133-178`). O ARCHITECTURE §5.1 já os tem.

### Categoria 4 — Regras de negócio inconsistentes

**4.1 (Média) RF54 x código.** Ver 2.1. O ciclo do requisito não prevê espera de cotação de frete nem produção, mas o código depende deles (RN16, RN24).

**4.2 (Baixa) RN07: multa sem regra.** A multa contratual PJ é descontada pelo financeiro num estorno parcial (`features/shared/lib/refunds/refund-rules.ts:44`), sem valor ou percentual configurado. Nem `docs/AtelierBureau_Politicas.md` define a multa.
Recomendação: definir a política (percentual ou critério) ou registrar que é caso a caso.

**4.3 (Baixa) RN22: prazo com dupla fonte.** `WITHDRAWAL_DAYS = 7` está fixo no código (`features/shared/lib/support/return-policy.ts:22`) e também na setting `refund.withdrawal_days` (`prisma/seed-data.ts:105`). `effectiveWithdrawalDays` (`:34`) concilia os dois, mas o `CLAUDE.md` §7 proíbe valor de regra fixo no código. O piso legal de 7 dias justifica o fallback, mas isso deveria estar documentado.

**4.4 (Baixa) RN01 "acima de".** O código usa `>` (`checkout-actions.ts:751`), coerente com "acima de R$ 10.000,00". Exatamente R$ 10.000,00 não exige aprovação. Vale citar no `docs/AtelierBureau_Politicas.md:121` para evitar dúvida em teste de aceite.

### Categoria 5 — Documentação desatualizada

**5.1 (Alta) Status das issues.** `docs/AtelierBureau_Issues.md`: 87 de 93 issues aparecem como **Backlog**, inclusive as que já foram entregues e testadas, como #8, #21-#82 e #173-#182. As exceções são #2 e #4 "Em andamento", #217 "Em andamento" e 3 "Concluído". O cabeçalho (`:5`) diz "Total: 92 issues", mas a tabela tem 93 (com #217). O `CLAUDE.md` §1 ainda fala em "as 82 issues".
Recomendação: sincronizar com o GitHub Project, ou retirar a coluna de status do arquivo e apontar para o Project.

**5.2 (Alta) PCI-DSS e política de segurança desatualizados sobre o 2FA obrigatório.** A #177 foi entregue: `features/shared/lib/auth/permissions.ts:158-174`, migration `20261117000000_session_two_factor_verified`, `tests/access/mandatory-two-factor.test.ts` e merge do PR #199. Mesmo assim, `docs/AtelierBureau_PCI_DSS_SAQ_A.md:121` ainda diz "**não obrigatório para perfis internos** (pendência P5)", `:231` cita "pendência P5" e `docs/AtelierBureau_Politica_Seguranca.md:48` diz "Hoje o sistema não obriga".
Recomendação: mudar o item para "Atende", registrar no histórico de revisão do SAQ e atualizar a política.

**5.3 (Média) Contagens do banco.** `docs/banco-de-dados/README.md` ("51 tabelas e 20 gatilhos"), `01-escopo.md` §3 ("51 tabelas em 7 domínios"; a tabela de domínios não tem `rate_limit_buckets`) e `04-dicionario-de-dados.md:7` ("51 tabelas, 498 colunas, 79 FKs, 174 índices"). O schema tem 52 modelos.

**5.4 (Baixa) Checklist de lançamento.** `docs/AtelierBureau_Checklist_Lancamento.md:27` diz "(quando a trava da #7 estiver mesclada)", mas a trava já existe (`features/shared/lib/mercadopago/mercadopago.ts:97`, `tests/payment/mercadopago-sandbox-lock.test.ts:22`). O `:34` lista só 4 serviços.

**5.5 (Baixa) Performance.** `docs/AtelierBureau_Performance.md:19` diz "o CI ainda não tem MySQL", mas o workflow E2E já sobe MySQL 8.4 (`.github/workflows/e2e.yml:28-29`). O correto é que o `perf:api` não roda no CI.

**5.6 (Baixa) Requisitos "em aberto" já resolvidos.** O .docx §7 lista "Stack e estrutura: confirmar linguagem, framework..." como em aberto. A stack está decidida e documentada (ARCHITECTURE §1), mas a issue #1 segue "Backlog".

### Categoria 6 — Rotas e endpoints inexistentes ou divergentes

Todas as rotas citadas nos documentos existem em `app/`: `/api/webhooks/mercadopago`, `/api/health`, `/api/csp-report`, `/admin/usuarios`, `/admin/auditoria`, `/conta/seguranca`, `/conta/pedidos/[id]/pagamento` e `/media`. Os redirecionamentos do código também apontam para rotas existentes (`/entrar`, `/admin/sem-acesso`, `/conta/seguranca`). Não há rota quebrada.

**6.1 (Média) Link de e-mail que promete conteúdo inexistente.** O e-mail de NF-e emitida diz "O XML e o DANFE ficam disponíveis em Minha conta" (`emails/templates.ts:222`) e aponta para `/conta/pedidos` (`features/shared/lib/nfe/nfe-service.ts:223`). A área do cliente não mostra NF-e: `features/orders/order-tracking/action/order-tracking-actions.ts` não lê `invoices`. O download só existe no back office (`app/admin/nfe/[id]/[arquivo]/route.ts`). Ver 8.1.

**6.2 (Baixa) Rotas não documentadas.** `/componentes` (galeria interna, `notFound()` em produção, `app/componentes/page.tsx:11`), `/admin/sem-acesso`, `/demonstracao` e `/convite/[id]` não aparecem em nenhum documento de navegação. Não é erro, mas um mapa de rotas no ARCHITECTURE ajudaria a revisão.

### Categoria 7 — Inconsistências entre `docs/banco-de-dados` e `schema.prisma`

**7.1 (Média)** `rate_limit_buckets` (PK composta `key_hash` + `window_start`, índice em `expires_at`) ausente do DER, MER, dicionário e script SQL. Ver 2.2.

**7.2 (Baixa)** As demais colunas incluídas por migration depois da `init` foram conferidas e estão no dicionário: `status_detail`, `pix_qr_code_image`, `boleto_line`, `extra_lead_business_days`, `answered_by_id`, `previous_status`, `price_table_id`, `coupon_code`, `applied_promotions`, `legal_review` e `two_factor_verified`. Os enums de `orders.status` e `order_status_history` batem com o schema (`04-dicionario-de-dados.md:896`, `:977-978`). Os 20 gatilhos documentados (`05-gatilhos.md`) batem com a migration `20261115000000_database_triggers` (20 `CREATE TRIGGER`).

**7.3 (Baixa)** O `01-escopo.md` §2 diz que a exclusão lógica vale para `addresses`, mas `addresses` tem `onDelete: Cascade` a partir de `users` e `organizations` (`prisma/schema.prisma:503-504`). Hoje é coerente, porque usuários e organizações também usam soft delete. A anonimização da LGPD, porém, deveria dizer explicitamente o que acontece com os endereços.

### Categoria 8 — Fluxos de uso incompletos

**8.1 (Alta) Financeiro PJ sem NF-e nem boletos na área do cliente.** A persona "Financeiro (PJ)" do .docx §6 "acompanha boletos faturados, NF-e e vencimentos". A permissão corporativa `finance:read` é definida (`features/shared/lib/auth/corporate-roles.ts:17`, `:24`), mas **não é usada em nenhum lugar**. Na área do cliente não há listagem de parcelas faturadas, linha digitável, vencimentos nem XML/DANFE. Os boletos chegam só por e-mail (`invoicedInstallmentsEmail`, `emails/templates.ts:309`), e a NF-e só pelo e-mail, que ainda aponta para uma tela que não existe (6.1).
Recomendação: criar em `/conta/pedidos/[id]` (ou `/conta/financeiro`) a seção de parcelas e de NF-e, com `finance:read` e escopo da organização.

**8.2 (Média) Retorno bancário do faturado.** O RF33 prevê baixa "por retorno bancário". Só existe a baixa manual com o rótulo `BANK_RETURN` (`features/shared/lib/invoiced/invoiced-math.ts:21-23`). Não há importação de arquivo de retorno.
Recomendação: implementar o upload do retorno (mesmo simulado) ou registrar a decisão de escopo na issue #60.

**8.3 (Média) Testes de integração fora do CI.** O `CLAUDE.md` §12 e o RNF07 exigem teste de integração nos fluxos críticos. Eles existem (`tests/integration/*.test.ts`, 20 arquivos), mas são excluídos do `vitest.config.ts:16` e nenhum workflow roda `npm run test:integration`. A regressão nos fluxos de pagamento, estoque e aprovação só é detectada se alguém rodar à mão.
Recomendação: adicionar ao `e2e.yml`, que já sobe o MySQL, um passo `npm run test:integration`.

**8.4 (Média) Verificações manuais sem registro.** O teste de restauração do backup (`docs/AtelierBureau_Backup_Restauracao.md:122-126`), o teste de alerta do monitoramento (`docs/AtelierBureau_Monitoramento.md:87-89`), o teste de carga (`docs/AtelierBureau_Performance.md:72-73`), as medições de LCP e p95, o leitor de tela (`docs/AtelierBureau_Acessibilidade.md:24-26`), o pagamento em sandbox com CSP restrita (PCI P2) e a AOC do Mercado Pago (`docs/pci/README.md`) estão pendentes. Sem esses registros, RNF01, RNF02, RNF10, RNF11 e RNF13 ficam parciais.

**8.5 (Baixa) RNF04 via CSV.** A importação em massa não aceita imagens (ver RNF04 na matriz). O produto importado fica sem imagem até a edição manual.

### Categoria 9 — Requisitos sem evidência completa de implementação

Nenhum requisito ficou sem código. Os que têm evidência incompleta:

| Requisito | O que falta |
|---|---|
| RF33 | Processamento de retorno bancário |
| RN22 | Validação jurídica dos personalizados de PF (issue #4) |
| RNF01 | Medição de uptime e registro do teste de alerta |
| RNF02 | Execução real do teste de carga contra o app |
| RNF03 | Criptografia em repouso de e-mail, endereços e backup; TLS obrigatório no servidor MySQL |
| RNF04 | Imagens na importação CSV |
| RNF10 | Medição de LCP e p95 no servidor local |
| RNF11 | Registro do teste de restauração |
| RNF13 | Teste humano com leitor de tela |
| RNF09 | Critério qualitativo, sem gate automático |
| RF03, RF37 | Cobertura só indireta (render de acessibilidade) ou só com mock do 3DS |

## 4. Documentação desatualizada a corrigir

1. `docs/AtelierBureau_Issues.md`: status de 87 issues (Backlog → status real), "Total: 92" → 93 e critérios de aceite ainda desmarcados nas issues entregues.
2. `CLAUDE.md` §1: "as 82 issues" → número atual. §8: incluir `uptime-kuma` (3001), `webhook-gate` e `tunnel`, e corrigir "usuários restritos à sub-rede e com TLS" conforme o 1.5.
3. `docs/AtelierBureau_PCI_DSS_SAQ_A.md:121`, `:184` e `:231`: P5 (#177) resolvida → MFA "Atende", com nova linha no histórico de revisão.
4. `docs/AtelierBureau_Politica_Seguranca.md:48`: "Hoje o sistema não obriga" → 2FA obrigatório desde a #177. `:53`: corrigir a afirmação sobre `require_secure_transport`.
5. `ARCHITECTURE.md`: remover `framer-motion`, `next-themes` e `@tanstack/*` (§1); trocar "S3-compatível" por disco local (§1); remover `hooks/` (§2); polling por `setInterval` (§3); RBAC corporativo estático (§4); `require_secure_transport` (§5); listar os Route Handlers de download (§2).
6. `docs/banco-de-dados/*`: rodar `npm run db:docs` para incluir `rate_limit_buckets` e atualizar as contagens (52 tabelas). `01-escopo.md` §3.1: incluir `content.home` e `security.*` e tirar "editados no back office" (ou implementar a tela). §4: "S3-compatível" → disco local.
7. `README.md`: tabela de scripts (incluir `perf:*`, `security:payment-page`, `db:validate` e `db:docs`), lista de serviços e firewall (porta 3001).
8. `docs/AtelierBureau_Checklist_Lancamento.md:27`: tirar "(quando a trava da #7 estiver mesclada)". `:34`: listar todos os serviços.
9. `docs/AtelierBureau_Performance.md:19`: "o CI ainda não tem MySQL" → "o `perf:api` não roda no CI".
10. `docs/AtelierBureau_Guia_Documentacao.md:60`: alinhar a regra dos READMEs de integração com a realidade (ou criar os READMEs).
11. `.env.example`: incluir `PAYMENT_CHECK_COOKIE` (opcional).
12. Levantamento de Requisitos (.docx): RF54 com `AWAITING_SHIPPING_QUOTE` e `IN_PRODUCTION` (nova NC); §7 "Em aberto" (stack já definida); premissa §1.1 sobre a configuração no back office, conforme a decisão do 1.6.
13. `emails/templates.ts:222`: texto do e-mail de NF-e promete XML/DANFE em "Minha conta". Corrigir junto com o 8.1 (é texto visível ao usuário, não só documentação).
