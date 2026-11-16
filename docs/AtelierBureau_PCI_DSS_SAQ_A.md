# Atelier Bureau — Checklist PCI-DSS SAQ A #173 | #174 | #175 | #176 | #177 | #178 | #179 | #180 | #181 | #182 |

Autoavaliação dos requisitos mínimos do PCI-DSS para o Checkout Transparente com o Payment Brick do Mercado Pago (RN19, issue #62). O documento revisa o código real do checkout e lista as pendências encontradas.

> **Natureza do documento.** Este é um checklist interno de projeto acadêmico, feito em ambiente de sandbox e homologação. Ele não substitui o formulário oficial do SAQ A nem a Declaração de Conformidade (AOC) assinada. A numeração segue o PCI DSS v4.0.1 e deve ser conferida com o formulário oficial vigente no PCI SSC antes de uma autoavaliação formal.

## 1. Controle de versão

| Versão | Data | Autor | Alteração |
|---|---|---|---|
| 1.0 | 14/11/2026 | Equipe Atelier Bureau | Primeira versão: elegibilidade, checklist por requisito e pendências, com base no código do checkout das issues #54 a #59 |

Revisar este documento **a cada mudança no checkout** (pagamento, Brick, cabeçalhos de segurança, proxy ou integrações) e, no mínimo, **uma vez por ano**.

## 2. Escopo

| Item | Situação no projeto |
|---|---|
| Canal | E-commerce (site Next.js servido pelo Caddy em HTTPS, rede local da entrega) |
| Meios com cartão | Cartão de crédito pelo Payment Brick do Mercado Pago (RF28, RF35, RF36) |
| Meios sem cartão | Pix e boleto pelo Mercado Pago (RF29); faturado 28/56 dias com boleto próprio (RF12, RF33), fora do escopo do PCI |
| Provedor de pagamento | Mercado Pago (Checkout Transparente, ambiente de teste) |
| Dados de cartão no servidor | **Nenhum.** O servidor recebe só o token do Brick (RF35) e grava só o `payment_id` e o status (RF32) |
| Dados de cartão no banco | **Nenhum** (RN19). Não há coluna de PAN, validade, nome impresso ou código de segurança |

### 2.1 Fluxo do dado de cartão

1. A página de pagamento (`features/payment/order-payment/order-payment-view.tsx`) carrega o SDK JS v2 de `https://sdk.mercadopago.com/js/v2` e monta o Payment Brick com a **chave pública** (`MERCADOPAGO_PUBLIC_KEY`).
2. O cliente digita os dados do cartão nos campos do Brick, renderizados e tokenizados pelo Mercado Pago no navegador.
3. O `onSubmit` do Brick entrega ao site apenas o `formData` com o **token**, o meio, o emissor, as parcelas e o documento do pagador.
4. A Server Action `payOrder` (`features/payment/order-payment/action/payment-actions.ts`) valida o payload com `payOrderSchema` (`features/payment/order-payment/schema/payment-schema.ts`), que **recusa** qualquer chave com cara de dado de cartão (`card_number`, `security_code`, `cvv`, `expiration_*`, `cardholder`) antes de ler o resto.
5. O servidor monta o corpo do `POST /v1/payments` com o valor do pedido (nunca o do navegador) e o token, usando o **access token** só no servidor (`features/shared/lib/mercadopago/mercadopago.ts`), e grava o `payment_id` e o status.
6. A confirmação chega pelo webhook com assinatura HMAC validada e idempotência (`app/api/webhooks/mercadopago/route.ts`) e pela reconciliação por `GET /v1/payments/{id}`.

## 3. Critérios de elegibilidade ao SAQ A

Legenda: **Atende**, **Parcial** (atende com ressalva ou falta evidência formal), **Não atende**, **N/A**.

| # | Critério | Situação | Evidência no projeto |
|---|---|---|---|
| E1 | Só transações sem cartão presente (e-commerce) | Atende | Não há loja física nem maquininha no escopo |
| E2 | Todo o processamento do cartão é terceirizado a um provedor certificado PCI DSS | Parcial | Mercado Pago processa e tokeniza. **Falta arquivar a AOC do Mercado Pago** (pendência P6) |
| E3 | Os elementos da página de pagamento que capturam o cartão vêm do provedor (iframe ou campos seguros) | Parcial | Os campos são do Payment Brick. **Falta confirmar na documentação e na AOC do Mercado Pago que os campos de cartão do Brick são campos seguros em iframe** (pendência P6) |
| E4 | O comerciante não armazena, processa nem transmite dados de cartão nos seus sistemas | Atende | Só o token passa pelo servidor; `containsCardData` recusa payloads com dados de cartão; o banco não tem colunas de cartão |
| E5 | Cópias em papel ou eletrônicas de dados de cartão, se houver, não são eletrônicas | N/A | Não há coleta de cartão por telefone, e-mail ou papel |
| E6 | O site não está suscetível a ataques de scripts que afetem a página de pagamento (critério da revisão de 2025 do SAQ A; conferir no formulário oficial) | Parcial | CSP limita scripts externos ao Mercado Pago, mas mantém `'unsafe-inline'` e curingas de domínio (pendências P1 e P2) |

**Conclusão de elegibilidade:** o desenho do checkout é compatível com o SAQ A. A elegibilidade formal depende das pendências P1, P2 e P6.

## 4. Checklist por requisito

### Requisito 2 — Configurações seguras

| Item | Situação | Evidência ou observação |
|---|---|---|
| 2.2.2 Contas e senhas padrão de fornecedores alteradas ou desativadas | Parcial | MySQL sem `root` remoto e app com usuário sem DDL (`deploy/mysql/init/01-users.sh`). As contas fictícias do seed usam `SEED_PASSWORD` do `.env`: **no servidor de entrega, trocar ou desativar as contas do seed** (pendência P7) |
| Serviços desnecessários desligados | Atende | Caddy expõe só 80 (redireciona para 443) e 443; o túnel do webhook aceita só `POST /api/webhooks/mercadopago` (`deploy/caddy/Caddyfile.webhook`) |

### Requisito 3 — Proteção dos dados armazenados

| Item | Situação | Evidência ou observação |
|---|---|---|
| Nenhum dado de cartão (PAN, validade, nome, CVV) armazenado | Atende | `prisma/schema.prisma`: `payments` guarda `payment_id`, status, valor, Pix e boleto; nenhum dado de cartão (RN19) |
| Nenhum dado sensível de autenticação depois da autorização | Atende | O código de segurança nunca chega ao servidor (`payOrderSchema`) |
| Logs sem dados de cartão | Atende | `features/shared/lib/logger/logger.ts` mascara chaves como `card`, `cvv`, `token`, `document` e `headers`; os logs do Mercado Pago gravam só a operação e o status HTTP |

### Requisito 4 — Transmissão em redes públicas

| Item | Situação | Evidência ou observação |
|---|---|---|
| HTTPS em todas as páginas, sem retorno ao HTTP | Atende | `deploy/caddy/Caddyfile`: redirecionamento 308 e HSTS; `upgrade-insecure-requests` na CSP (`features/shared/lib/security/headers.ts`) |
| Certificado confiável | Parcial | `tls internal` (CA local) serve à rede da entrega acadêmica. **Em produção, usar certificado de CA pública** (pendência P8) |
| Chamadas ao Mercado Pago em TLS | Atende | Base `https://api.mercadopago.com`; o SDK é carregado por HTTPS |

### Requisito 6 — Sistemas e software seguros

| Item | Situação | Evidência ou observação |
|---|---|---|
| 6.4.3 Inventário, autorização e integridade dos scripts da página de pagamento | Parcial | Único script externo: `https://sdk.mercadopago.com/js/v2`, carregado só na página de pagamento (`MERCADO_PAGO_SDK_URL`, `features/shared/lib/mercadopago/bricks.ts`). O inventário está na seção 5. **Falta a justificativa formal aprovada e a política para scripts inline** (pendência P1) |
| Proteções contra clickjacking | Atende | `X-Frame-Options: DENY` e `frame-ancestors 'none'` |
| CSP restringindo origens | Parcial | Scripts, frames e conexões externas limitados ao Mercado Pago, mas com `'unsafe-inline'` em `script-src` e curingas como `https://*.mlstatic.com` (pendências P1 e P2) |
| Valor e dados do pagamento definidos no servidor | Atende | `payOrder` usa o total do pedido gravado, nunca o valor enviado pelo navegador (RF36) |
| Dependências atualizadas e revisadas | Parcial | `npm audit` não roda no CI. **Incluir verificação de vulnerabilidades das dependências** (pendência P4) |

### Requisito 8 — Identificação e autenticação

| Item | Situação | Evidência ou observação |
|---|---|---|
| Usuários únicos no back office, sem contas compartilhadas | Atende | Usuários internos nominais com perfis (RF55, `/admin/usuarios`) |
| Senhas com hash | Atende | Better Auth (hash, cookie `httpOnly`) |
| MFA para acesso administrativo | Parcial | 2FA disponível (Better Auth `twoFactor`), mas **não obrigatório para perfis internos** (pendência P5) |
| Bloqueio de tentativas | Parcial | Rate limit nas rotas de login e cadastro (`features/shared/lib/rate-limit/rate-limit.ts`). **A Server Action de pagamento não tem rate limit próprio** (pendência P3) |

### Requisito 9 — Acesso físico

| Item | Situação | Evidência ou observação |
|---|---|---|
| Mídias com dados de cartão | N/A | Não há mídia com dados de cartão. Os backups do banco não contêm cartão (RN19) e ficam fora do Git |

### Requisito 11 — Testes de segurança

| Item | Situação | Evidência ou observação |
|---|---|---|
| 11.3.2 Varredura externa de vulnerabilidades por ASV, trimestral | Não atende | O servidor da entrega fica na rede local; só o webhook é exposto pelo túnel. **Contratar varredura ASV ao publicar na internet** (pendência P9) |
| 11.6.1 Detecção de alteração não autorizada na página de pagamento | Não atende | Não há monitoramento de mudança dos scripts e cabeçalhos da página de pagamento (pendência P1). `deploy/check-headers.sh` confere os cabeçalhos manualmente |

### Requisito 12 — Políticas

| Item | Situação | Evidência ou observação |
|---|---|---|
| 12.8 Lista de provedores e responsabilidades | Parcial | Mercado Pago é o único provedor que toca dados de cartão. **Falta registrar a matriz de responsabilidades e a AOC anual do provedor** (pendência P6) |
| 12.10.1 Plano de resposta a incidentes | Não atende | Não há plano escrito de resposta a incidentes de pagamento (pendência P10) |
| Política de segurança da informação | Parcial | Regras no `CLAUDE.md` e no `ARCHITECTURE.md` (segredos só no `.env`, logs sem dados pessoais). **Falta uma política formal** (pendência P10) |

## 5. Inventário de scripts da página de pagamento (6.4.3)

| Script | Origem | Onde carrega | Justificativa | Integridade |
|---|---|---|---|---|
| Mercado Pago JS SDK v2 | `https://sdk.mercadopago.com/js/v2` | Só em `/conta/pedidos/[id]/pagamento` (componente `Script` do Next.js) | Obrigatório para o Payment Brick e a tokenização (RF28, RF35) | O provedor publica o SDK sem versão fixa; SRI não se aplica. Mitigação: CSP restrita à origem do Mercado Pago |
| Scripts do próprio site | Mesma origem (`'self'`) | Todas as páginas | Aplicação Next.js | Gerados no build; scripts inline do Next.js liberados por `'unsafe-inline'` (pendência P1) |

## 6. Pendências (viram issues)

Cada pendência virou uma issue no GitHub em 15/11/2026, com os labels indicados, o milestone v1.0.0 e o vínculo com a RN19. A coluna "Issue" leva a ela.

| # | Pendência | Requisito | Prioridade | Labels | Issue |
|---|---|---|---|---|---|
| P1 | Trocar `'unsafe-inline'` de `script-src` por nonce ou hash nas páginas de pagamento, aprovar o inventário de scripts e monitorar mudanças de scripts e cabeçalhos na página de pagamento | 6.4.3, 11.6.1, E6 | P1 | `tipo: task`, `área: pagamento`, `segurança` | #173 |
| P2 | Restringir os curingas de domínio da CSP (`*.mercadopago.com`, `*.mlstatic.com`, `*.mercadolibre.com`, `*.mercadolivre.com`) aos hosts que o Brick usa de fato | 6.4.3, E6 | P2 | `tipo: task`, `área: pagamento`, `segurança` | #174 |
| P3 | Aplicar rate limit às Server Actions de pagamento e estorno (tentativas de cartão por pedido e por IP) | 8, RNF05 | P1 | `tipo: task`, `área: pagamento`, `segurança` | #175 |
| P4 | Rodar `npm audit` (ou equivalente) no CI e tratar vulnerabilidades altas e críticas | 6.3 | P2 | `tipo: task`, `área: app`, `infra`, `segurança` | #176 |
| P5 | Tornar o 2FA obrigatório para os perfis internos com acesso a pedidos, pagamentos e estornos | 8 | P1 | `tipo: task`, `área: acesso`, `segurança` | #177 |
| P6 | Arquivar a AOC do Mercado Pago, confirmar que os campos de cartão do Brick são campos seguros em iframe e registrar a matriz de responsabilidades | E2, E3, 12.8 | P1 | `tipo: task`, `área: pagamento`, `documentação` | #178 |
| P7 | No servidor de entrega, trocar ou desativar as contas fictícias do seed e a senha `SEED_PASSWORD` | 2.2.2 | P1 | `tipo: task`, `área: app`, `infra`, `segurança` | #179 |
| P8 | Usar certificado de CA pública ao publicar fora da rede local | 4 | P2 | `tipo: task`, `área: app`, `infra`, `segurança`, `escopo a validar` | #180 |
| P9 | Contratar varredura trimestral por ASV ao expor o site na internet | 11.3.2 | P2 | `tipo: task`, `área: app`, `infra`, `segurança`, `escopo a validar` | #181 |
| P10 | Escrever a política de segurança da informação e o plano de resposta a incidentes de pagamento | 12.10.1 | P2 | `tipo: task`, `área: pagamento`, `documentação` | #182 |

## 7. Pontos que já atendem (resumo)

- Tokenização no navegador pelo Payment Brick; o servidor recebe só o token (RF35).
- Recusa explícita de payloads com dados de cartão (`containsCardData`) e logs com mascaramento.
- Nenhum dado de cartão no banco; só o `payment_id` e o status (RN19, RF32).
- Access token só no servidor; chave pública só no navegador.
- Valor do pagamento definido pelo servidor; chave de idempotência em pagamentos e estornos.
- Webhook com assinatura HMAC, idempotência e túnel restrito à rota do webhook (RF30).
- HTTPS com HSTS, CSP, `X-Frame-Options: DENY` e `frame-ancestors 'none'`.
- Estornos pela API com auditoria (RF34, RNF12).
