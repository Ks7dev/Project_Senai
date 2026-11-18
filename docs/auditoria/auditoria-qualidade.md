# Auditoria de qualidade e funcionalidade — Atelier Bureau

- **Data:** 18/11/2026
- **Branch auditada:** `perf/217-build-optimizations` (develop + otimizações de build), commit `2569c19`
- **Escopo:** `features/*`, `app/`, `components/`, `lib/`, `emails/` e testes (`tests/`). Ignorados `.claude/`, `node_modules/`, `.next/` e `generated/`.
- **Modo:** somente leitura no código. Nenhum arquivo do repositório foi alterado (`git status` limpo ao final). As reproduções rodaram como testes descartáveis, fora do repositório, contra o MySQL local de desenvolvimento, com fixtures que se apagam ao final.

## Resumo executivo

O código está em bom estado. Unit, integração, lint e typecheck passam sem falha. As Server Actions seguem a ordem do CLAUDE.md (Zod → sessão/permissão → Prisma → `ActionResult`). Os fluxos críticos usam `$transaction` com `SELECT ... FOR UPDATE` em ordem estável (pedido → pagamento, estoque ordenado por `sku_id`). O webhook é idempotente pelo `x-request-id` e confirma o pedido só com `approved` e o valor exato. A busca não achou `TODO`, `FIXME`, `console.log` nem `catch` vazio.

Os achados relevantes estão nas **bordas do ciclo de vida do pedido**:

- cancelamento depois da baixa de estoque;
- pedidos que nunca expiram;
- expiração sem consultar o Mercado Pago.

Há também dívidas menores de padrão (Zod inline, exports sem uso, textos em inglês na UI) e módulos do back office ainda pendentes.

| Severidade | Confirmados | Suspeitas |
|---|---|---|
| Critical | 0 | 0 |
| High | 0 | 0 |
| Medium | 2 | 2 |
| Low | 9 | 4 |

---

## Testes executados

Todos os números abaixo foram copiados da saída real dos comandos.

| # | Comando | Resultado | Duração |
|---|---|---|---|
| 1 | `npm test` (Vitest unit) | **68 arquivos, 727 testes, todos passaram** | 16,96 s (Vitest) / 19,6 s (wall) |
| 2 | `npm run test:coverage` | **68 arquivos, 727 testes, todos passaram. Limites do `vitest.config.ts` atendidos** (exit 0) | 17,63 s / 20,7 s |
| 3 | `npx tsx --env-file=.env node_modules/vitest/vitest.mjs run --config vitest.integration.config.ts` (MySQL local do Docker) | **20 arquivos, 176 testes, todos passaram** | 153,29 s / 2 min 38,6 s |
| 4 | `npx tsc --noEmit -p tsconfig.json` | sem erros | 8,5 s |
| 5 | `npm run lint` | sem erros nem avisos | 30,2 s |
| 6 | Reprodução própria (teste descartável, fora do repositório, contra o mesmo MySQL) | **2 testes, 2 passaram** (os testes afirmam o comportamento defeituoso atual, ver QA-001 e QA-002) | 1,13 s |
| 7 | `npm run test:e2e` (Playwright) | **não executado** (motivo abaixo) | — |

Aviso não bloqueante em todas as execuções do Vitest: *"ESM syntax in a file loaded as CommonJS (vitest.config.ts)"*. O Vite pede extensão `.mjs` ou `"type": "module"` (ver QA-019).

### Cobertura (unit, v8)

Total: **Statements 49,63% (3296/6640) · Branches 44,99% (1992/4427) · Functions 55,13% (736/1335) · Lines 49,92% (3050/6109)**.

Limites do `vitest.config.ts` e situação medida:

| Alvo | Limite | Medido | Situação |
|---|---|---|---|
| Global lines / statements / functions / branches | 35 / 35 / 42 / 34 | 49,9 / 49,6 / 55,1 / 45,0 | OK |
| `features/shared/lib/correios/**` | L90 / B80 | L96,9 / B83,5 | OK |
| `features/shared/lib/carrier/**` | L90 / B80 | L98,0 / B91,1 | OK |
| `features/shared/lib/mercadopago/**` | L80 / B75 | L87,1 / B82,2 | OK |
| `features/shared/lib/security/**` | L95 / B95 | L100 / B100 | OK |

Pastas com cobertura unit mais baixa (linhas). Algumas são cobertas pela suíte de integração, conforme a coluna ao lado:

| Pasta | Lines | Branches | Integração cobre? |
|---|---|---|---|
| backoffice/home-content, backoffice/internal-users, cart/customer-quotes, cart/project-lists, catalog/categories, orders/order-tracking, shared/lib/jobs | 0% | 0% | internal-users, category-navigation e order-tracking sim; as demais não |
| orders/address-change | 2,2% | 0% | sim (`address-change.test.ts`) |
| payment/checkout | 3,5% | 0% | sim (`placeOrder` em 2 arquivos) |
| cart/cart-page | 6,0% | 0% | sim (`cart.test.ts`) |
| cart/quote-management | 9,2% | 7,4% | sim (`quote-management.test.ts`) |
| orders/order-approval | 10,9% | 5,9% | sim (`order-approval.test.ts`) |
| finance/refunds | 76,1% | 49,6% | **não há teste de integração** (ver QA-014) |
| finance/invoiced-billing | 68,1% | 25,0% | **não há teste de integração** (ver QA-014) |

### Por que o E2E não foi executado

O `playwright.config.ts` sobe o app com `npm run start`, na porta 3000. Pelo workflow `.github/workflows/e2e.yml`, ele precisa de banco migrado com seed, `SEED_PASSWORD`, `BETTER_AUTH_SECRET`, `DATA_ENCRYPTION_KEY` e `JOBS_DISABLED=true`. Tecnicamente daria para rodar. A porta 3000 do host está livre (o container `app` não publica a 3000), existe um build em `.next` (BUILD_ID de 17/11 21:47) e o Chromium do Playwright está instalado. Mesmo assim, não rodei, por três motivos:

1. **Execução posterior:** o E2E foi rodado depois desta auditoria, em 18/11/2026, com `JOBS_DISABLED=true`, um build novo e `SEED_PASSWORD` exportada: **2 testes, 2 passaram** (compra completa e compra só com teclado). Sem `SEED_PASSWORD` no ambiente, os dois falham no login, porque o Playwright não lê o `.env` e usa a senha padrão.
2. **Efeitos colaterais no banco compartilhado:** o `.env` local tem `JOBS_DISABLED=""`. Um `next start` local subiria um segundo agendador de jobs (expiração, reconciliação, fila de e-mail, NF-e) concorrendo com o container `app` no mesmo MySQL. Além disso, o E2E cria endereços e pedidos reais no banco de desenvolvimento.
3. **Build possivelmente defasado:** o `.next` é anterior ao último commit (22:01). Com `output: "standalone"`, o `next start` emite aviso e o caminho suportado é `node .next/standalone/server.js`. Um build novo (`npm run build`) mudaria `.next`.

Para rodar com segurança: `JOBS_DISABLED=true`, `npm run build` e `npm run test:e2e`. O ideal é usar um banco descartável, como faz o CI.

---

## Achados CONFIRMADOS

"Confirmado" significa que há reprodução por teste executado (QA-001, QA-002) ou evidência objetiva e determinística por busca no código (demais).

### QA-001 — Cancelar pedido já pago não devolve as unidades ao estoque

- **Arquivo:** `features/shared/lib/orders/order-lifecycle.ts:135-141`; `features/shared/lib/stock/stock-service.ts:206-232`
- **Severidade:** **Medium**
- **Descrição:** `transitionOrder(..., to: "CANCELED")` chama só `releaseOrderStock`, que devolve apenas reservas pendentes (`RESERVE - RELEASE - WRITE_OFF`). Em `PAID`, `IN_PRODUCTION` e `SEPARATING` a reserva já virou `WRITE_OFF` (saiu de `on_hand`). O ciclo de vida permite `CANCELED` a partir desses três status (`order-status.ts:67-69`). O cancelamento então não devolve nada, e a mercadoria que nunca saiu do depósito some do estoque disponível.
- **Cenário:** SKU com 2 unidades → pedido de 1 → `PAID` (on_hand 1, reserved 0) → admin cancela com motivo `customer_request` ou `defect` → on_hand continua 1.
- **Evidência:** teste `QA: PAID -> CANCELED returns the written-off units to stock?` (teste descartável, fora do repositório). Após `PAID`: `{onHand:1, reserved:0}`. Após `CANCELED`: `{onHand:1, reserved:0}` (passou afirmando esse comportamento). O teste de integração existente (`order-lifecycle.test.ts:237`) só cobre o cancelamento **antes** do pagamento.
- **Impacto:** o estoque fica subestimado. Produtos high ticket aparecem como "sob encomenda" sem necessidade, e a correção depende de reposição manual que ninguém é avisado de fazer. Isso descumpre o espírito de AB-064 ("liberação na expiração ou cancelamento").
- **Correção proposta:** em `transitionOrder`, quando `to === "CANCELED"` e `from` estiver em `PAID`, `IN_PRODUCTION` ou `SEPARATING` (antes de `INVOICED`/`SHIPPED`), gerar um movimento de devolução (`RESTOCK`, ou um novo tipo `RETURN`, via migration) com `on_hand += unidades baixadas`. Itens personalizados podem ser excluídos (RN24), porque não são revendáveis. Cobrir com teste de integração.

### QA-002 — Pedidos com cartão (e os que aguardam aprovação ou cotação de frete) nunca expiram e prendem a reserva indefinidamente

- **Arquivo:** `features/shared/lib/orders/order-expiration.ts:27-33` e `74-86`
- **Severidade:** **Medium**
- **Descrição:** o job `expire-unpaid-orders` só considera `paymentMethod in ["PIX", "BOLETO"]`. Os casos abaixo nunca são varridos, e o cliente não tem ação para cancelar o próprio pedido:
  - pedido `CARD` em `AWAITING_PAYMENT` (cliente desistiu, cartão recusado, aba fechada);
  - pedidos em `AWAITING_APPROVAL` sem decisão;
  - pedidos em `AWAITING_SHIPPING_QUOTE` sem resposta.
- **Cenário:** pedido com cartão criado há 30 dias, com reserva de 1 unidade → `expireUnpaidOrders(new Date())` → não cancela.
- **Evidência:** teste `QA: an abandoned CARD order never expires and keeps the reservation` (teste descartável). Status continua `AWAITING_PAYMENT` e o contador fica `{onHand:1, reserved:1}`.
- **Impacto:** o estoque disponível é consumido por pedidos abandonados. Com itens de pouca unidade (edição limitada), um único pedido abandonado bloqueia a venda.
- **Correção proposta:** criar prazos configuráveis na tabela de configuração e no seed (regra do CLAUDE.md §7), como `order.card_payment_hours`, `order.approval_days` e `order.shipping_quote_days`, e varrê-los no mesmo job com `FOR UPDATE`. Para cartão, cancelar só se não houver pagamento `PENDING`/`APPROVED`. Registrar a decisão de prazo na issue correspondente.

### QA-003 — `getSecurityStatus` é Server Action exportada sem `try/catch` e sem `ActionResult`

- **Arquivo:** `features/access/security/action/two-factor.ts:103-112`
- **Severidade:** Low
- **Descrição:** retorna `SecurityStatus | null` e lança qualquer erro de banco ou do Better Auth direto para a UI. Isso foge da regra do CLAUDE.md §6 ("sem lançar exceção para a UI").
- **Cenário:** MySQL indisponível ao abrir `/conta/seguranca` → a exceção sobe ao `error.tsx`, em vez de virar mensagem amigável.
- **Evidência:** é a única action exportada do repositório sem `try` (varredura de todos os `action/*.ts`).
- **Correção proposta:** envolver em `try/catch` com `toActionError`, retornando `ActionResult<{ status: SecurityStatus | null }>`. Se precisar ser loader de página, mover para fora de `action/`.

### QA-004 — Textos em inglês na UI acessível ("Close")

- **Arquivo:** `components/ui/dialog.tsx:74` e `:112`; `components/ui/sheet.tsx:74`
- **Severidade:** Low
- **Descrição:** o botão de fechar de Dialog/Sheet tem `<span className="sr-only">Close</span>`, e o rodapé do Dialog mostra o texto visível `Close`. Leitores de tela anunciam "Close" em páginas pt-BR, o que viola o CLAUDE.md §3 e o RNF13.
- **Cenário:** abrir qualquer Sheet (menu mobile, carrinho) com NVDA ou VoiceOver.
- **Correção proposta:** trocar por "Fechar" nos três pontos.

### QA-005 — Schemas Zod inline em actions

- **Arquivos:**
  - `features/shared/lib/favorites/favorite-actions.ts:49`
  - `features/catalog/products-admin/action/product-actions.ts:132`, `437`, `492`, `526`, `529`, `577` (e o `z.enum` em `listAdminProducts`, l. 76-80)
  - `features/shipping/manual-quotes/action/manual-quote-actions.ts:66-75`
  - `features/backoffice/home-content/action/home-content-actions.ts:110`
- **Severidade:** Low
- **Descrição:** o CLAUDE.md §5 exige o Zod "nunca inline", num arquivo coeso em `schema/`, com o mesmo schema no client e na action. Em `home-content-actions.ts:110`, `z.uuid().parse(randomUUID())` valida um UUID gerado pelo próprio servidor e é código sem efeito.
- **Correção proposta:** mover para `schema/*.ts` da feature (ou `features/shared/schema/`) e remover a validação redundante.

### QA-006 — Exports sem uso (código morto)

- **Severidade:** Low
- **Evidência:** varredura de todos os `export` de `features/`, `components/`, `lib/` e `emails/` contra o restante do repositório (script descartável, fora do repositório).
- **Sem nenhum uso**, nem em produção nem em teste:
  - `ConsentGate` (`features/shared/components/cookie-consent.tsx:208`)
  - `basisPointsToPercent` (`features/shared/lib/pricing/pricing-math.ts:88`)
  - `isQuoteAttachmentType` (`features/shared/lib/quotes/quote-attachments.ts:42`)
  - `isQuoteStatus` (`features/shared/lib/quotes/quote-status.ts:39`)
  - `getRequestId` (`features/shared/lib/request/request-id.ts:11`). A correlação de logs de Server Action com o proxy, que o JSDoc promete, não é feita em lugar nenhum.
- **Usados só por testes:**
  - `EMAIL_TOKEN_SOURCES` (`emails/email-tokens.ts:31`)
  - `isInstitutionalSlug` (`features/shared/lib/content/institutional-pages.ts:44`)
  - `WITHDRAWAL_EXPIRED_MESSAGE` (`features/shared/lib/support/return-policy.ts:98`)
  - `formatCpf` (`features/shared/lib/validation/documents.ts:60`)
- **Correção proposta:** remover, ou usar `getRequestId` no `logger` das actions (que era a intenção original). Isso conflita com o RNF09 só quando houver duplicação, então a prioridade é baixa.

### QA-007 — Módulos do back office pendentes (funcionalidade incompleta)

- **Arquivo:** `features/shared/lib/auth/permissions.ts:54-59`, `76`, `100-117` (`PENDING_ADMIN_ROUTES`)
- **Severidade:** Low (escopo)
- **Descrição:** `/admin/separacao` ("Separação e expedição"), `/admin/clientes` e `/admin/configuracoes` estão declarados no menu, mas não existem em `app/admin/` e ficam ocultos. Sem `/admin/configuracoes`, os valores configuráveis de RN01, RN06, RN14, RN16 e RN20 só mudam por seed ou SQL. O CLAUDE.md §7 proíbe alterar o banco à mão no servidor de entrega. As permissões `customer:read` e `setting:manage` existem sem tela. Nenhuma issue em `docs/AtelierBureau_Issues.md` cobre esses três módulos.
- **Correção proposta:** registrar a decisão. Ou abrir as issues (prioridade P2), ou remover os itens do `adminModules` e as permissões sem uso, mantendo o menu e as permissões coerentes com o escopo.

### QA-008 — Não existe ajuste negativo de estoque (`ADJUSTMENT` nunca é gravado)

- **Arquivo:** `prisma/schema.prisma:49`; `features/orders/stock/action/stock-actions.ts:29`; `features/shared/lib/stock/stock-service.ts:243` (só `restockSku`)
- **Severidade:** Low
- **Descrição:** o enum `StockMovementType.ADJUSTMENT` e o rótulo "Ajuste" existem, mas nenhum código grava esse tipo. O back office só soma unidades (reposição). Perda, avaria ou divergência de inventário não podem ser lançadas, o que deixa o CRUD de estoque incompleto. Somado ao QA-001, quem corrige erros de contagem não tem ferramenta.
- **Correção proposta:** criar a action `adjustStock` (com `FOR UPDATE`, sem permitir `on_hand < reserved`, motivo obrigatório e auditoria) ou remover o valor do enum por migration (expand/contract).

### QA-009 — `Product.deleted_at` não tem escritor; o produto não pode ser excluído (só inativado)

- **Arquivo:** `prisma/schema.prisma` (model Product, `deletedAt`); `features/catalog/products-admin/action/product-actions.ts:283`
- **Severidade:** Low
- **Descrição:** todas as leituras filtram `deletedAt: null`, mas nenhum código grava `deletedAt` em produtos (`grep "deletedAt: new Date"` só acha endereços, promoções, tabelas de preço, listas de projeto e anonimização LGPD). A coluna é obsoleta. Além disso, `saveProduct` atualiza por `id` sem filtrar `deletedAt` (l. 283), e a unicidade de `slug` (l. 238) considera produtos excluídos.
- **Correção proposta:** decidir entre exclusão lógica de verdade (action `deleteProduct` com soft delete, filtrando `deletedAt` no update e no slug) e remoção da coluna, registrando a decisão. Hoje a inativação (`INACTIVE`) cobre o uso.

### QA-010 — Exclusão física de imagens e documentos de produto

- **Arquivo:** `features/catalog/products-admin/action/product-actions.ts:495` e `580`
- **Severidade:** Low
- **Descrição:** `productImage.delete` e `productDocument.delete` são exclusões feitas pelo usuário, mas físicas, contra o CLAUDE.md §7 ("Exclusão feita pelo usuário é soft delete"). O `before` vai para a auditoria e os arquivos são removidos do storage, então não há recuperação.
- **Correção proposta:** aceitar como exceção documentada (arquivos de mídia) num comentário ou ADR, ou adotar `deleted_at` e uma limpeza posterior.

### QA-011 — Limite de corpo do webhook medido em caracteres e depois de ler tudo

- **Arquivo:** `app/api/webhooks/mercadopago/route.ts:48-49`
- **Severidade:** Low
- **Descrição:** `await request.text()` lê o corpo inteiro e só então compara `text.length` (unidades UTF-16, não bytes) com `MAX_BODY_BYTES`. A rota é a única exposta pelo túnel. Antes da assinatura, um corpo grande é lido inteiro em memória.
- **Correção proposta:** checar `Content-Length` antes de ler e usar `Buffer.byteLength(text)`, ou ler com limite via `request.body` (stream).

---

## SUSPEITAS (sem reprodução executada)

### QA-012 — Expiração de Pix/boleto cancela sem consultar o Mercado Pago; pagamento aprovado depois só gera log

- **Arquivo:** `features/shared/lib/orders/order-expiration.ts:74-150`; `features/shared/lib/payments/payment-sync.ts:197-216`; `features/shared/lib/payments/payment-deadlines.ts:41-49`
- **Severidade:** **Medium**
- **Descrição:** o job roda a cada minuto e cancela assim que `expiresAt < now` para pagamento `PENDING`. Não há margem de compensação nem consulta a `GET /v1/payments/{id}` (a reconciliação roda a cada 5 min e é independente). Um boleto pago no último dia é compensado em 1 a 3 dias úteis, e um Pix pago nos últimos segundos pode ter webhook atrasado. O pedido então vai para `CANCELED` e o estoque é liberado. Quando o `approved` chega, `applyProviderPayment` só faz `logger.warn("payment approved for an order not awaiting payment")`: não abre estorno, não avisa o financeiro, não marca o pedido.
- **Cenário:** boleto vence D+3 úteis → cliente paga em D+3 → job cancela em D+3 23:59 → em D+4 o Mercado Pago aprova → o cliente pagou um pedido cancelado e só o log registra o fato.
- **Impacto:** dinheiro capturado sem pedido, cliente sem retorno e conciliação manual dependente de log (risco de reclamação e chargeback).
- **Correção proposta:**
  1. Antes de cancelar, chamar `refreshPendingPayment` ou `getMercadoPagoPayment` dentro do fluxo do job (fora da transação) e só cancelar se continuar `pending`/`expired`.
  2. Para boleto, aplicar uma margem configurável (`payment.boleto_grace_business_days`) no seed.
  3. No ramo "aprovado para pedido não pagável", criar automaticamente um `Refund` `PENDING_APPROVAL` (motivo `CANCELLATION`) e enfileirar um e-mail ao financeiro na mesma transação.
- **Para confirmar:** teste de integração com `applyProviderPayment` aprovando um pedido já `CANCELED`.

### QA-013 — Verificação RN24 lê o pedido antes do lock (TOCTOU)

- **Arquivo:** `features/orders/order-management/action/order-management-actions.ts:223-241` (leitura) e `262` (lock em `transitionOrder`)
- **Severidade:** Low
- **Descrição:** a regra de não cancelar personalizado após produção (RN24) usa `order.status` lido por `findUnique` sem `FOR UPDATE`. O lock só acontece depois, em `transitionOrder`. Se outro operador mover o pedido para `IN_PRODUCTION` entre a leitura e o lock, o cancelamento com motivo `customer_request` passa, porque `PAID → CANCELED` e `IN_PRODUCTION → CANCELED` são transições válidas.
- **Correção proposta:** fazer `SELECT ... FOR UPDATE` no início da transação (ou expor `lockOrder` do lifecycle) antes da checagem RN24, ou passar a checagem para dentro de `transitionOrder` com um callback de validação.

### QA-014 — Estorno e faturado sem teste de integração; estorno "em processamento" sem acompanhamento automático

- **Arquivo:** `features/finance/refunds/action/refund-actions.ts:688-700`; `features/shared/lib/jobs/app-jobs.ts:30-61`; `tests/integration/` (sem refunds e sem invoiced-billing)
- **Severidade:** Medium (processo e testes) / Low (funcional)
- **Descrição:**
  1. O CLAUDE.md §6 lista estorno entre as operações transacionais críticas, e §12.3/RNF07 pede teste de integração dos fluxos críticos. `requestRefund`, `approveRefund`, `retryRefund`, `confirmInvoicedOrder` e `settleInstallment` têm só testes unitários com mocks.
  2. Quando o Mercado Pago responde o estorno com status diferente de `approved`/`rejected`, o `Refund` fica `PROCESSING` e nenhum job o acompanha. Só um `retryRefund` manual o conclui. Enquanto isso, o webhook atualiza `payments.status` para `REFUNDED` sem fechar o `Refund` nem mover o pedido para `REFUNDED`, o que deixa o pagamento e o pedido inconsistentes.
- **Correção proposta:** adicionar `tests/integration/refunds.test.ts` e `invoiced-billing.test.ts`. Criar um job `reconcile-refunds` que repita `processRefund` (idempotente pela chave = `refundId`) para estornos `PROCESSING` com `providerRefundId`.

### QA-015 — Checkout mantém contexto velho após "valores mudaram"

- **Arquivo:** `features/payment/checkout/checkout-view.tsx:183-217` (e `:143-158`, onde o total vem de `context.promotions`)
- **Severidade:** Low
- **Descrição:** quando `placeOrder` devolve `prices_changed` ou `quote_changed` (promoção expirou, frete mudou), a view só mostra o erro. O total exibido e o `expectedTotal` reenviado continuam os antigos, então o cliente recebe o mesmo erro a cada clique até recarregar a página ou trocar de endereço. Como `ActionResult` devolve só a mensagem, a view nem consegue distinguir o caso.
- **Correção proposta:** devolver `code` no erro (ou um campo `stale: true`) e, nesses casos, chamar `router.refresh()` e `requote(addressId)` automaticamente.

### QA-016 — Assinatura do webhook sem tolerância de `ts` (replay)

- **Arquivo:** `features/shared/lib/mercadopago/mercadopago.ts:440-471`
- **Severidade:** Low
- **Descrição:** o `ts` entra no HMAC, mas sua idade não é verificada, então uma notificação assinada capturada pode ser reenviada. O impacto é baixo porque o processamento relê o pagamento no Mercado Pago e deduplica por `x-request-id`. A cada reenvio, porém, há uma chamada à API e um `upsert`.
- **Correção proposta:** recusar `ts` com mais de 5 a 10 minutos de diferença (configurável).

### QA-017 — Pedido faturado que passa por cotação manual de frete depende de ação manual do financeiro

- **Arquivo:** `features/payment/checkout/action/checkout-actions.ts:752-760`; `features/shipping/manual-quotes/action/manual-quote-actions.ts:236-256`; `features/finance/invoiced-billing/action/invoiced-billing-actions.ts:400-444`
- **Severidade:** Low
- **Descrição:** `INVOICED` + `AWAITING_SHIPPING_QUOTE` → a resposta do comercial leva a `AWAITING_PAYMENT`. A página de pagamento diz "não é paga pelo site", e só `confirmInvoicedOrder` (financeiro) leva a `PAID`. O fluxo existe, mas nada avisa o financeiro, e o pedido não expira (ver QA-002).
- **Correção proposta:** enfileirar um e-mail ou alerta para o financeiro quando um pedido faturado entra em `AWAITING_PAYMENT`, ou confirmar automaticamente se o crédito couber (como no checkout, `confirmNow`).

---

## Outras observações (sem severidade)

- **QA-018 (info):** `.env` local com `JOBS_DISABLED=""`. Qualquer `next dev` ou `next start` local roda os jobs contra o mesmo MySQL do container `app`, e os dois agendadores competem. A expiração é segura graças ao `FOR UPDATE`, mas a fila de e-mail e a NF-e podem duplicar tentativas. Recomendação: `JOBS_DISABLED=true` no `.env` de desenvolvimento quando o Docker estiver rodando.
- **QA-019 (info):** o Vitest avisa que `vitest.config.ts` e `vitest.integration.config.ts` são ESM carregados como CommonJS. Renomear para `.mts` evita quebra quando o `configLoader: 'native'` virar padrão.
- **Acessibilidade (verificado):** todas as `<img>` e `<Image>` têm `alt` (decorativas com `alt=""`), e todos os botões `size="icon"` têm `aria-label`. A exceção é o texto em inglês do QA-004.
- **Responsividade:** as classes usam breakpoints e tokens do design system. A leitura não mostrou layout fixo sem quebra.
- **Pontos fortes verificados:**
  - lock de carrinho contra clique duplo no `placeOrder`;
  - retentativa de número de pedido;
  - crédito faturado travando a organização;
  - pagamento com lock pedido → pagamento em todos os caminhos;
  - `nextPaymentStatus` que nunca volta de status final para pendente e recusa valor divergente;
  - refund com chave de idempotência;
  - expiração relendo pagamentos sob lock.

## Evidências locais

Os logs das suítes, as reproduções de QA-001 e QA-002 (testes descartáveis contra o MySQL local) e a varredura de exports sem uso foram executados numa área temporária, fora do repositório, e não foram versionados. Para reproduzir: QA-001 e QA-002 são cobertos pelos passos descritos nos próprios achados; a varredura de exports pode ser refeita com uma busca de cada `export` em `features/`, `components/`, `lib/` e `emails/` contra o restante do repositório.
