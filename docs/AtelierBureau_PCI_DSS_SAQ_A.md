# Atelier Bureau — Checklist PCI-DSS SAQ A

Autoavaliação dos requisitos mínimos do PCI-DSS para o Checkout Transparente com o Payment Brick do Mercado Pago (RN19, issue #62). O documento revisa o código real do checkout e lista as pendências encontradas.

> **Natureza do documento.** Este é um checklist interno de projeto acadêmico, feito em ambiente de sandbox e homologação. Ele não substitui o formulário oficial do SAQ A nem a Declaração de Conformidade (AOC) assinada. A numeração segue o PCI DSS v4.0.1 e deve ser conferida com o formulário oficial vigente no PCI SSC antes de uma autoavaliação formal.

## 1. Controle de versão

| Versão | Data | Autor | Alteração |
|---|---|---|---|
| 1.0 | 14/11/2026 | Equipe Atelier Bureau | Primeira versão: elegibilidade, checklist por requisito e pendências, com base no código do checkout das issues #54 a #59 |
| 1.1 | 17/11/2026 | Equipe Atelier Bureau | `npm audit` no CI e tratamento das vulnerabilidades das dependências (pendência P4, #176, seção 6.1) |
| 1.2 | 17/11/2026 | Equipe Atelier Bureau | Requisito 12: links para a política de segurança e o plano de resposta a incidentes de pagamento (#182), com aprovação pendente |
| 1.3 | 17/11/2026 | Equipe Atelier Bureau | Seção 2.2 (campos seguros do Brick confirmados no código e na documentação, E3 passa a Atende), seção 8 (matriz de responsabilidades) e `docs/pci/README.md` para a AOC do Mercado Pago (#178) |
| 1.4 | 17/11/2026 | Equipe Atelier Bureau | Bloqueio de tentativas passa a atender: rate limit nas Server Actions de pagamento e estorno (pendência P3, #175) |
| 1.5 | 17/11/2026 | Equipe Atelier Bureau | CSP da página de pagamento com nonce, inventário de scripts com baseline versionado e detecção de mudança (#173); hosts concretos do Mercado Pago no lugar dos curingas (#174) |

Revisar este documento **a cada mudança no checkout** (pagamento, Brick, cabeçalhos de segurança, proxy ou integrações) e, no mínimo, **uma vez por ano**.

## 2. Escopo

| Item | Situação no projeto |
|---|---|
| Canal | E-commerce (site Next.js servido pelo Caddy em HTTPS, numa VPS pública com domínio próprio, #206) |
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

### 2.2 Campos de cartão do Brick: campos seguros do Mercado Pago (E3, #178)

Conferência feita em 17/11/2026 no código da `develop` e na documentação pública do Mercado Pago.

**No código:**

| Evidência | Arquivo e linhas | O que mostra |
|---|---|---|
| Origem do SDK | `features/shared/lib/mercadopago/bricks.ts`, linha 2 | `MERCADO_PAGO_SDK_URL = "https://sdk.mercadopago.com/js/v2"`: o único script externo é o SDK JS v2 do Mercado Pago |
| Carga do SDK | `features/payment/order-payment/order-payment-view.tsx`, linhas 396 a 400 | `<Script src={MERCADO_PAGO_SDK_URL}>` só na página de pagamento |
| Montagem do Brick | `features/shared/lib/mercadopago/bricks.ts`, linhas 54 a 57; `order-payment-view.tsx`, linhas 313 a 332 | `new window.MercadoPago(publicKey).bricks().create("payment", paymentContainer, ...)`: o SDK monta o Brick com a chave pública |
| Contêiner vazio | `order-payment-view.tsx`, linha 455 | `<div id={paymentContainer} />`: o site entrega só um `div` vazio; os campos de cartão são inseridos pelo SDK |
| Nenhum campo de cartão do site | `features/payment/**` | Não há `<input>` de número, validade, CVV ou titular. Os únicos `<input>` são rádios de endereço, frete, instalação e meio de pagamento (`checkout/checkout-view.tsx`, linhas 274, 316, 394 e 427) e a linha digitável do boleto, somente leitura (`order-payment-view.tsx`, linha 199) |
| Retorno do Brick só com token | `bricks.ts`, linhas 10 a 16; `order-payment-view.tsx`, linhas 294 a 301 | `onSubmit` recebe `formData` e o repassa à action `payOrder` |
| Servidor aceita só o token | `features/payment/order-payment/schema/payment-schema.ts`, linhas 9 a 10, 44 a 69 e 146 a 149 | `cardFormSchema` lê só `token`, `payment_method_id`, `issuer_id`, `installments` e `payer`; `payOrderSchema` recusa antes qualquer chave de cartão (`containsCardData`) |
| Frames só do Mercado Pago | `features/shared/lib/security/headers.ts`, linhas 2 a 7 e 32 | `frame-src` aceita só `'self'` e os domínios do Mercado Pago, então o navegador só exibe iframes dessa origem |

**Na documentação do Mercado Pago:**

- [Card Payment Brick — introdução](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/card-payment-brick/introduction): os campos de cartão do Brick (número, validade e código de segurança) já atendem às normas de segurança do PCI, e o callback de envio recebe o **token** do cartão. O Payment Brick usa o mesmo formulário de cartão.
- [Bricks — PCI DSS](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/additional-content/security/pci.md): os campos de entrada do cartão vêm direto dos servidores do Mercado Pago, numa área segura, o ambiente de dados do cartão fica hospedado pelo Mercado Pago, e o Checkout Transparente se enquadra no SAQ A. A página também afirma que o Mercado Pago é certificado PCI DSS.
- [Secure Fields](https://mercadopago.cl/developers/en/news/2022/09/30/Secure-Fields-protects-card-details-at-checkout): no SDK JS v2, os campos seguros são iframes servidos pelo Mercado Pago, que enviam o cartão direto aos servidores dele.

**Conclusão:** o site não renderiza nenhum campo de cartão; o SDK JS v2 do Mercado Pago insere o formulário do Brick num contêiner vazio, e a CSP só permite frames das origens do Mercado Pago. O critério E3 passa a **Atende**. Conferência manual recomendada a cada mudança no checkout: nas ferramentas do desenvolvedor do navegador, os campos de número, validade e CVV aparecem dentro de `<iframe>` com origem do Mercado Pago, e nenhuma requisição ao próprio site leva esses dados.

## 3. Critérios de elegibilidade ao SAQ A

Legenda: **Atende**, **Parcial** (atende com ressalva ou falta evidência formal), **Não atende**, **N/A**.

| # | Critério | Situação | Evidência no projeto |
|---|---|---|---|
| E1 | Só transações sem cartão presente (e-commerce) | Atende | Não há loja física nem maquininha no escopo |
| E2 | Todo o processamento do cartão é terceirizado a um provedor certificado PCI DSS | Parcial | Mercado Pago processa e tokeniza e declara a certificação PCI DSS na documentação (seção 2.2). **Falta arquivar a AOC do Mercado Pago** em `docs/pci/` (como obter em [`docs/pci/README.md`](pci/README.md), pendência P6) |
| E3 | Os elementos da página de pagamento que capturam o cartão vêm do provedor (iframe ou campos seguros) | Atende | O site não tem campo de cartão; o SDK JS v2 do Mercado Pago insere os campos seguros do Brick num contêiner vazio, e a CSP só aceita frames do Mercado Pago. Evidências no código e na documentação na seção 2.2 (#178) |
| E4 | O comerciante não armazena, processa nem transmite dados de cartão nos seus sistemas | Atende | Só o token passa pelo servidor; `containsCardData` recusa payloads com dados de cartão; o banco não tem colunas de cartão |
| E5 | Cópias em papel ou eletrônicas de dados de cartão, se houver, não são eletrônicas | N/A | Não há coleta de cartão por telefone, e-mail ou papel |
| E6 | O site não está suscetível a ataques de scripts que afetem a página de pagamento (critério da revisão de 2025 do SAQ A; conferir no formulário oficial) | Parcial | Na página de pagamento, `script-src` aceita só scripts da mesma origem, com o nonce da requisição ou dos hosts concretos do Mercado Pago, sem `'unsafe-inline'` e sem curingas (#173, #174). Mudanças na CSP e nos scripts são detectadas (seção 5.2). **Falta o teste do pagamento em sandbox com a CSP restrita** (pendência P2) |

**Conclusão de elegibilidade:** o desenho do checkout é compatível com o SAQ A. A elegibilidade formal depende das pendências P2 (teste em sandbox) e da AOC do Mercado Pago (P6).

## 4. Checklist por requisito

### Requisito 2 — Configurações seguras

| Item | Situação | Evidência ou observação |
|---|---|---|
| 2.2.2 Contas e senhas padrão de fornecedores alteradas ou desativadas | Parcial | MySQL sem `root` remoto e app com usuário sem DDL (`deploy/mysql/init/01-users.sh`). As contas fictícias do seed usam `SEED_PASSWORD` do `.env`: **no servidor de entrega, trocar ou desativar as contas do seed** (pendência P7) |
| Serviços desnecessários desligados | Atende | Na VPS, só 22 (SSH com chave), 80 (redireciona para 443) e 443 ficam abertas; MySQL e painel de monitoramento só no loopback. No servidor local, o túnel do webhook aceita só `POST /api/webhooks/mercadopago` (`deploy/caddy/Caddyfile.webhook`) |

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
| Certificado confiável | Atende | Na VPS de entrega, certificado Let's Encrypt (CA pública) para o domínio, renovado pelo Caddy (`deploy/caddy/Caddyfile.vps`, #180, #206). O `tls internal` (CA local) fica só no servidor local de desenvolvimento |
| Chamadas ao Mercado Pago em TLS | Atende | Base `https://api.mercadopago.com`; o SDK é carregado por HTTPS |

### Requisito 6 — Sistemas e software seguros

| Item | Situação | Evidência ou observação |
|---|---|---|
| 6.4.3 Inventário, autorização e integridade dos scripts da página de pagamento | Atende | Único script externo: `https://sdk.mercadopago.com/js/v2`, carregado só na página de pagamento (`MERCADO_PAGO_SDK_URL`, `features/shared/lib/mercadopago/bricks.ts`). O inventário, com a justificativa de cada script, está na seção 5 e no baseline versionado `deploy/payment-page-baseline.json`. Scripts inline só rodam com o nonce da requisição (#173) |
| Proteções contra clickjacking | Atende | `X-Frame-Options: DENY` e `frame-ancestors 'none'` |
| CSP restringindo origens | Parcial | Scripts, frames e conexões externas limitados aos hosts concretos do Mercado Pago (`MERCADO_PAGO_CSP_HOSTS`, `features/shared/lib/security/headers.ts`, #174). Na página de pagamento, `script-src` usa nonce, sem `'unsafe-inline'` (#173). **Falta o teste do pagamento em sandbox com a CSP restrita** (pendência P2) |
| Valor e dados do pagamento definidos no servidor | Atende | `payOrder` usa o total do pedido gravado, nunca o valor enviado pelo navegador (RF36) |
| Dependências atualizadas e revisadas | Atende | O CI roda `npm audit --audit-level=high` logo após o `npm ci` e falha com vulnerabilidade alta ou crítica. Situação e justificativas na seção 6.1 (pendência P4, #176) |

### Requisito 8 — Identificação e autenticação

| Item | Situação | Evidência ou observação |
|---|---|---|
| Usuários únicos no back office, sem contas compartilhadas | Atende | Usuários internos nominais com perfis (RF55, `/admin/usuarios`) |
| Senhas com hash | Atende | Better Auth (hash, cookie `httpOnly`) |
| MFA para acesso administrativo | Parcial | 2FA disponível (Better Auth `twoFactor`), mas **não obrigatório para perfis internos** (pendência P5) |
| Bloqueio de tentativas | Atende | Rate limit nas rotas de login e cadastro (`features/shared/lib/rate-limit/rate-limit.ts`). As Server Actions de pagamento e estorno têm limite próprio, gravado no banco (`rate_limit_buckets`) e configurável na tabela `settings`: tentativas de pagamento por pedido e por IP, e solicitações de estorno por usuário. A recusa mostra mensagem genérica e grava log de auditoria (`features/shared/lib/rate-limit/persistent-limit.ts`, pendência P3 resolvida na #175) |

### Requisito 9 — Acesso físico

| Item | Situação | Evidência ou observação |
|---|---|---|
| Mídias com dados de cartão | N/A | Não há mídia com dados de cartão. Os backups do banco não contêm cartão (RN19) e ficam fora do Git |

### Requisito 11 — Testes de segurança

| Item | Situação | Evidência ou observação |
|---|---|---|
| 11.3.2 Varredura externa de vulnerabilidades por ASV, trimestral | Não atende | O site da entrega fica exposto na internet (VPS, #206), mas o Mercado Pago roda em sandbox e não há transação real com cartão. **Contratar varredura ASV antes de aceitar pagamentos reais** (pendência P9, decisão a registrar na #181) |
| 11.6.1 Detecção de alteração não autorizada na página de pagamento | Atende | Quatro camadas (seção 5.2): o teste `tests/shared/payment-page-csp.test.ts` falha no CI se a CSP mudar sem atualizar o baseline; `npm run security:payment-page -- <url>` compara a página publicada com o baseline e sai com erro em divergência; as violações da CSP chegam a `/api/csp-report`, que grava `csp violation` no log; e `deploy/check-headers.sh` confere o nonce (#173) |

### Requisito 12 — Políticas

| Item | Situação | Evidência ou observação |
|---|---|---|
| 12.8 Lista de provedores e responsabilidades | Parcial | Mercado Pago é o único provedor que toca dados de cartão. Matriz de responsabilidades registrada na seção 8 (#178). **Falta arquivar a AOC anual do provedor** ([`docs/pci/README.md`](pci/README.md), pendência P6) |
| 12.10.1 Plano de resposta a incidentes | Parcial | [Plano de resposta a incidentes de pagamento](AtelierBureau_Resposta_Incidentes_Pagamento.md) escrito (#182): detecção, classificação, contenção, comunicação ao Mercado Pago, às bandeiras, à ANPD e aos titulares, evidências, recuperação, lições aprendidas e teste anual. **Falta a aprovação do responsável e o preenchimento dos contatos** |
| Política de segurança da informação | Parcial | [Política de segurança da informação](AtelierBureau_Politica_Seguranca.md) escrita (#182): papéis, acesso e 2FA, senhas, segredos, backup, logs e auditoria, dependências, terceiros e revisão anual. **Falta a aprovação do responsável** |

## 5. Inventário de scripts da página de pagamento (6.4.3)

| Script | Origem | Onde carrega | Justificativa | Integridade |
|---|---|---|---|---|
| Mercado Pago JS SDK v2 | `https://sdk.mercadopago.com/js/v2` | Só em `/conta/pedidos/[id]/pagamento` (componente `Script` do Next.js, com o nonce) | Obrigatório para o Payment Brick e a tokenização (RF28, RF35) | O provedor publica o SDK sem versão fixa; SRI não se aplica. Mitigação: CSP restrita aos hosts concretos do Mercado Pago |
| Assets do Payment Brick | `https://http2.mlstatic.com` | Carregados pelo SDK na página de pagamento | Scripts, estilos, fontes e logos do Brick | Controlados pelo Mercado Pago; liberados só nesse host |
| Scripts do próprio site | Mesma origem (`/_next/static/`) | Todas as páginas | Aplicação Next.js | Gerados no build. Na página de pagamento, os scripts inline do Next.js só rodam com o nonce da requisição (#173) |

**Aprovação:** o inventário vale como aprovado quando o PR que altera esta seção ou o `deploy/payment-page-baseline.json` é revisado e aprovado pelo responsável pelo checkout. Script novo na página de pagamento só entra com a linha nesta tabela, a entrada no baseline e essa aprovação.

### 5.1 CSP da página de pagamento (#173, #174)

- O `proxy.ts` gera um nonce aleatório de 128 bits por requisição e envia a CSP da página de pagamento (`buildPaymentContentSecurityPolicy`) na resposta e na requisição, com o nonce também em `x-nonce`. O Next.js aplica o nonce aos próprios scripts, e a página o repassa ao `<Script>` do SDK.
- A página de pagamento é renderizada inteira por requisição (`instant = false` e leitura dos cabeçalhos antes de qualquer `Suspense`), porque um shell estático não teria o nonce.
- Os links para a página de pagamento fazem carregamento completo do documento (`<a>` e `window.location.assign`), para que a CSP com nonce venha com a página, e não da página anterior.
- As demais páginas continuam estáticas, com a CSP de `next.config.ts` (com `'unsafe-inline'`), que não se aplica à página de pagamento (`STATIC_CSP_SOURCE`).
- Hosts liberados, sem curingas: `sdk.mercadopago.com` e `http2.mlstatic.com` (scripts); `api.mercadopago.com`, `api.mercadolibre.com` e `http2.mlstatic.com` (conexões); `secure-fields.mercadopago.com`, `api-static.mercadopago.com`, `sdk.mercadopago.com`, `www.mercadopago.com.br` e `www.mercadolivre.com.br` (iframes); `http2.mlstatic.com` (imagens, estilos e fontes). A lista saiu dos hosts referenciados pelo SDK JS v2 para o Brasil, porque o Mercado Pago não publica uma lista oficial de CSP para o Checkout Bricks.

### 5.2 Detecção de mudança (11.6.1)

| Camada | Como funciona | Alerta |
|---|---|---|
| Baseline versionado | `deploy/payment-page-baseline.json` guarda a CSP aprovada (com `{nonce}` no lugar do nonce) e os scripts aprovados. O teste `tests/shared/payment-page-csp.test.ts` compara a CSP gerada pelo código com o baseline | O CI falha em qualquer divergência |
| Verificação da página publicada | `npm run security:payment-page -- https://<domínio> [id-do-pedido]` (no servidor local, com o IP e `NODE_EXTRA_CA_CERTS=deploy/certs/root.crt`) busca a página, compara a CSP e os `<script>` do HTML com o baseline e confere o nonce de cada script. Com `PAYMENT_CHECK_COOKIE` (cookie de sessão de um cliente fictício), confere a página já autenticada. Agendar no servidor (cron, a cada hora) | Sai com código 1 e linhas `ALERTA:` |
| Relatórios do navegador | A CSP da página de pagamento tem `report-uri /api/csp-report` e `report-to csp-endpoint` (`Reporting-Endpoints`). A rota só grava `csp violation` no log, com a diretiva, a origem bloqueada e o caminho da página, sem query string nem dados pessoais | Linha `warn` no log do `app` |
| Conferência da rede | `sh deploy/check-headers.sh <ip>` também confere que o `script-src` da página de pagamento tem nonce e não tem `'unsafe-inline'` | Sai com código 1 |

## 6. Pendências (viram issues)

Cada pendência virou uma issue no GitHub em 15/11/2026, com os labels indicados, o milestone v1.0.0 e o vínculo com a RN19. A coluna "Issue" leva a ela.

**Situação em 17/11/2026:** P1 implementada (#173). P2 implementada no código (#174), faltando o teste do pagamento em sandbox com a CSP restrita, que precisa ser feito por uma pessoa no navegador.

| # | Pendência | Requisito | Prioridade | Labels | Issue |
|---|---|---|---|---|---|
| P1 | Trocar `'unsafe-inline'` de `script-src` por nonce ou hash nas páginas de pagamento, aprovar o inventário de scripts e monitorar mudanças de scripts e cabeçalhos na página de pagamento | 6.4.3, 11.6.1, E6 | P1 | `tipo: task`, `área: pagamento`, `segurança` | #173 |
| P2 | Restringir os curingas de domínio da CSP (`*.mercadopago.com`, `*.mlstatic.com`, `*.mercadolibre.com`, `*.mercadolivre.com`) aos hosts que o Brick usa de fato | 6.4.3, E6 | P2 | `tipo: task`, `área: pagamento`, `segurança` | #174 |
| P3 | Aplicar rate limit às Server Actions de pagamento e estorno (tentativas de cartão por pedido e por IP) | 8, RNF05 | P1 | `tipo: task`, `área: pagamento`, `segurança` | #175 |
| P4 | Rodar `npm audit` (ou equivalente) no CI e tratar vulnerabilidades altas e críticas | 6.3 | P2 | `tipo: task`, `área: app`, `infra`, `segurança` | #176 |
| P5 | Tornar o 2FA obrigatório para os perfis internos com acesso a pedidos, pagamentos e estornos | 8 | P1 | `tipo: task`, `área: acesso`, `segurança` | #177 |
| P6 | Arquivar a AOC do Mercado Pago, confirmar que os campos de cartão do Brick são campos seguros em iframe e registrar a matriz de responsabilidades | E2, E3, 12.8 | P1 | `tipo: task`, `área: pagamento`, `documentação` | #178 |
| P7 | No servidor de entrega, trocar ou desativar as contas fictícias do seed e a senha `SEED_PASSWORD` | 2.2.2 | P1 | `tipo: task`, `área: app`, `infra`, `segurança` | #179 |
| P8 | Usar certificado de CA pública ao publicar fora da rede local (atendida pela VPS com Let's Encrypt, #206) | 4 | P2 | `tipo: task`, `área: app`, `infra`, `segurança`, `escopo a validar` | #180 |
| P9 | Contratar varredura trimestral por ASV ao expor o site na internet | 11.3.2 | P2 | `tipo: task`, `área: app`, `infra`, `segurança`, `escopo a validar` | #181 |
| P10 | Escrever a política de segurança da informação e o plano de resposta a incidentes de pagamento | 12.10.1 | P2 | `tipo: task`, `área: pagamento`, `documentação` | #182 |

### 6.1 Auditoria de dependências (P4, #176)

- **Onde roda:** passo "Audit dependencies" do `.github/workflows/ci.yml`, em todo PR e push para `develop` e `master`, com `npm audit --audit-level=high`. Vulnerabilidade alta ou crítica reprova o CI.
- **Árvore auditada:** a completa, sem `--omit=dev`. As ferramentas de desenvolvimento (ESLint, Prisma CLI, Vitest, tsx) rodam no próprio CI e no build da imagem Docker, então uma dependência de desenvolvimento comprometida também atinge o artefato entregue.
- **Moderadas e baixas:** não reprovam o CI, para não travar entregas por avisos sem correção publicada. São revisadas a cada release e corrigidas quando houver versão compatível.

Situação em 17/11/2026 (`npm audit` sobre 919 pacotes):

| Vulnerabilidade | Severidade | Origem | Tratamento |
|---|---|---|---|
| `minimatch` 7.0.0 a 11.0.0, negação de serviço por amplificação de padrões ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249)) | Moderada (10 avisos na cadeia) | `minimatch@10` usado por `@typescript-eslint/typescript-estree` (ESLint) e por `@ts-morph/common` (CLI do `shadcn`) | Corrigida com `overrides` no `package.json`, que fixa `minimatch@^11.0.1` só nesses dois pacotes. O `npm audit fix --force` sugerido trocaria o `shadcn` pela versão 1.0.0, uma regressão |

Depois da correção, `npm audit` não aponta nenhuma vulnerabilidade (0 baixas, 0 moderadas, 0 altas e 0 críticas). Não há vulnerabilidade alta ou crítica pendente de justificativa. Quando surgir uma sem correção, ela é registrada nesta tabela com o motivo, e a exceção é temporária, revista a cada release.

Remover os `overrides` quando o `typescript-eslint` e o `ts-morph` passarem a depender de um `minimatch` corrigido.

## 7. Pontos que já atendem (resumo)

- Tokenização no navegador pelo Payment Brick; o servidor recebe só o token (RF35).
- Recusa explícita de payloads com dados de cartão (`containsCardData`) e logs com mascaramento.
- Nenhum dado de cartão no banco; só o `payment_id` e o status (RN19, RF32).
- Access token só no servidor; chave pública só no navegador.
- Valor do pagamento definido pelo servidor; chave de idempotência em pagamentos e estornos.
- Webhook com assinatura HMAC e idempotência (RF30), chegando direto pelo domínio na VPS ou por túnel restrito à rota do webhook no servidor local.
- HTTPS com HSTS, CSP, `X-Frame-Options: DENY` e `frame-ancestors 'none'`.
- Estornos pela API com auditoria (RF34, RNF12).

## 8. Matriz de responsabilidades (12.8.5)

Divisão dos requisitos do PCI DSS entre a Atelier Bureau e o Mercado Pago, o único provedor que toca dados de cartão (#178). A divisão do lado do Mercado Pago deve ser conferida com a AOC e a matriz que ele fornecer junto com ela ([`docs/pci/README.md`](pci/README.md)); havendo divergência, vale o documento do Mercado Pago e esta tabela é corrigida.

| Requisito PCI | Atelier Bureau | Mercado Pago | Compartilhado |
|---|---|---|---|
| Captura do cartão na página (E3) | Carregar só o SDK oficial e montar o Brick num contêiner vazio, sem campo de cartão próprio | Servir os campos seguros do Brick e o SDK JS v2 | — |
| Tokenização, autorização e processamento (E2) | Enviar ao `POST /v1/payments` só o token e o valor do pedido gravado no servidor | Tokenizar, autorizar, processar e liquidar a transação | — |
| 3 — Armazenamento de dados de cartão | Não armazenar cartão em banco, logs ou backups (RN19, `containsCardData`, logger com máscara) | Armazenar e proteger o cartão e os cartões salvos do comprador | — |
| 4 — Transmissão em redes públicas | HTTPS com HSTS no site e TLS nas chamadas à API | TLS no SDK, nos campos seguros e na API | — |
| 2.2.2 — Contas e configurações padrão | Servidor, MySQL, Caddy e contas do seed (pendência P7) | Infraestrutura própria | — |
| 6.3 — Vulnerabilidades e atualizações | Dependências do site e imagens Docker (pendência P4) | SDK JS v2 e ambiente de dados do cartão | — |
| 6.4.3 e 11.6.1 — Scripts e alterações na página de pagamento | Inventário, autorização e monitoramento dos scripts e cabeçalhos da página (seção 5, pendência P1) | Integridade do SDK e do conteúdo dos iframes servidos por ele | Conferir, a cada versão do SDK, os domínios que o Brick usa (pendência P2) |
| 8 — Identificação e autenticação | Contas nominais e 2FA no back office (pendência P5) | Acesso ao painel e às credenciais da conta Mercado Pago | Proteger o login do painel do Mercado Pago com 2FA e guardar o access token só no `.env` |
| 9 — Acesso físico | VPS (data center da Hostinger), máquina local de desenvolvimento e backups (sem dados de cartão) | Data centers do ambiente de cartão | — |
| 11.3.2 — Varredura ASV | Site público, quando houver (pendência P9) | Ambiente próprio | — |
| 12.8 — Gestão do provedor | Manter a lista de provedores, obter e conferir a AOC todo ano e acompanhar a validade | Fornecer a AOC e manter a certificação PCI DSS | Esta matriz, revisada todo ano |
| 12.10 — Resposta a incidentes | Plano de resposta e comunicação ao Mercado Pago (issue #182) | Resposta no ambiente de cartão e comunicação às bandeiras | Investigação conjunta de incidente na página de pagamento ou de fraude |
| Notificações e confirmação de pagamento | Validar a assinatura do webhook, idempotência, reconciliação e confirmar só com `approved` (RN13) | Enviar as notificações assinadas e expor `GET /v1/payments/{id}` | — |
| Antifraude e chargeback | Dados do pedido e do pagador corretos; atender às contestações | Análise antifraude, 3DS e gestão das contestações com as bandeiras | — |
