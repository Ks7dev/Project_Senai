# Auditoria de segurança (DevSecOps) — Atelier Bureau

- **Data:** 18/11/2026
- **Escopo:** repositório `loja` (branch `perf/217-build-optimizations`, commit `2569c19`), servidor local Docker em `https://localhost` e dependências npm.
- **Referências:** OWASP Top 10 (2021/2025), OWASP API Security Top 10 (2023), ASVS 4.0 e os requisitos do projeto (RNF03, RNF05, RNF06, RNF12, RNF16, RN07, RN13, RN19).
- **Método:**
  - Revisão manual de todas as 47 arquivos `"use server"` (156 actions exportadas), das 6 rotas (`app/api/*`, `app/media`, `app/admin/**/route.ts`), do `proxy.ts`, do `next.config.ts`, da configuração do Better Auth, da camada `features/shared/lib/**`, do Docker, do Caddy e do MySQL.
  - Varredura do histórico Git (302 commits) por padrões de segredo.
  - `npm audit --json`.
  - Requisições não destrutivas com `curl -k` contra `https://localhost`.
  - Leitura de variáveis do MySQL e dos **nomes** das variáveis de ambiente dos containers.
- **Restrições:** nenhum arquivo do repositório foi alterado. Nenhum valor de segredo aparece neste relatório: só os nomes das variáveis.

---

## 1. Resumo executivo

| Severidade | Confirmadas | Suspeitas (verificar) |
|---|---|---|
| Critical | 0 | 0 |
| High | 1 | 0 |
| Medium | 5 | 2 |
| Low | 14 | 4 |
| **Total** | **20** | **6** |

**Pontos fortes:** não há SQL injection (todo `$queryRaw` usa template parametrizado). XSS não tem sink explorável. O CSRF das Server Actions é barrado pela checagem de origem do Next.js (testado). O isolamento entre usuários e organizações (BOLA/IDOR) está correto em todas as actions revisadas. O webhook do Mercado Pago tem HMAC em tempo constante, idempotência, `FOR UPDATE` e checagem de valor. Os dados pessoais são criptografados com AES-256-GCM. Não há segredos reais no histórico do Git.

**Riscos principais:**
1. O cookie de sessão sai **sem o atributo `Secure`**, porque `BETTER_AUTH_URL` usa `http://`. Os links de e-mail também apontam para `http://localhost:3000`.
2. O MySQL **não exige TLS** (`require_secure_transport=OFF`), ao contrário do que dizem a RNF16 e a `ARCHITECTURE.md`.
3. O container do app recebe **todos os segredos** do `.env`, inclusive a senha do `root` e a credencial com DDL.
4. O cadastro PJ **não comprova o vínculo com o CNPJ**, o que permite sequestrar a conta corporativa de uma empresa real.
5. O rate limit é só por IP e em memória. Não há bloqueio por conta no login nem no TOTP.
6. A rota `/api/csp-report` lê o corpo inteiro sem limite quando a requisição não traz `Content-Length`.

---

## 2. Vulnerabilidades confirmadas

### SEC-001 — Cookie de sessão sem `Secure` e links de e-mail em HTTP (`BETTER_AUTH_URL` com `http://`)

- **Severidade:** High
- **Categoria:** OWASP A02/A07:2021 (falhas criptográficas e de autenticação), A05 (configuração insegura), ASVS 3.4.1.
- **Arquivo e localização:**
  - `features/shared/lib/auth/auth.ts:35-94`: `betterAuth({...})` não define `baseURL` nem `advanced.useSecureCookies`.
  - `.env` (não versionado), variável `BETTER_AUTH_URL`: hoje é `http://localhost:3000`, e o `docker-compose.yml:37-38` a injeta no app pelo `env_file: .env`.
  - Uso nos links: `features/shared/lib/auth/reset-link.ts` (redefinição de senha), `features/shared/lib/email/site-url.ts` (e-mails) e `features/access/corporate-members/action/members-actions.ts:198` (convite).
- **Descrição técnica:** o Better Auth 1.7.20 decide o atributo `Secure` (e o prefixo `__Secure-`) pelo esquema da `baseURL`, que vem de `BETTER_AUTH_URL`:
  ```js
  // node_modules/better-auth/dist/cookies/index.mjs:23
  ... baseURLString ? baseURLString.startsWith("https://") : isProduction) ? SECURE_COOKIE_PREFIX : ""
  // attributes: { secure: !!secureCookiePrefix, sameSite: "lax", httpOnly: true }
  ```
  Com `http://localhost:3000`, o cookie `better-auth.session_token` sai **sem `Secure`**, mesmo com o site servido em `https://<IP>`. O HSTS do Caddy não compensa: **navegadores ignoram HSTS em hosts que são IP literal**, e o acesso pela rede é feito por IP (`ARCHITECTURE.md` 5.1). Os links de redefinição de senha e de convite também apontam para `http://localhost:3000`, o que não funciona em outro dispositivo e levaria o token em texto claro se o host fosse real.
- **Cenário de exploração:**
  1. Um operador do back office (sessão com 2FA já verificada) digita `192.168.0.50` no navegador, sem `https://`.
  2. O navegador faz `GET http://192.168.0.50/` e **envia o cookie de sessão em texto claro**, antes do redirecionamento 308.
  3. Um atacante na mesma rede Wi-Fi (rede compartilhada do SENAI ou ARP spoofing) captura o cookie e o reaproveita.
- **Impacto:** sequestro da sessão de qualquer usuário, inclusive de perfis internos com `payment:refund` e `order:cancel`. Como a sessão já passou pelo 2FA, ele não protege. O token de redefinição de senha também pode trafegar em HTTP.
- **Evidência:**
  ```
  $ grep -E "^BETTER_AUTH_URL=" .env
  BETTER_AUTH_URL="http://localhost:3000"
  auth.ts: betterAuth({ appName, database, emailAndPassword, ... })   # sem baseURL / advanced
  ```
- **Recomendação:** definir `BETTER_AUTH_URL=https://<SITE_HOST>` no `.env` do servidor e forçar o cookie seguro em produção, independentemente da variável. Validar na inicialização que a URL é `https` quando `NODE_ENV=production`.
- **Correção proposta:**
  ```ts
  // features/shared/lib/auth/auth.ts
  function createAuth() {
    const baseURL = process.env.BETTER_AUTH_URL
    if (process.env.NODE_ENV === "production" && !baseURL?.startsWith("https://")) {
      throw new Error("BETTER_AUTH_URL must use https in production")
    }
    return betterAuth({
      appName: "Atelier Bureau",
      baseURL,
      advanced: {
        useSecureCookies: process.env.NODE_ENV === "production",
        defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
      },
      session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 60 }, // ver SEC-014
      // ...
    })
  }
  ```
  Atualizar também o exemplo do `.env.example` (`BETTER_AUTH_URL=https://192.168.0.50`) e o checklist de lançamento.
- **Teste de validação:**
  1. Fazer login em `https://<ip>` e conferir em DevTools > Application > Cookies que o nome é `__Secure-better-auth.session_token`, com as flags `Secure`, `HttpOnly` e `SameSite=Lax`.
  2. Rodar `curl -v http://<ip>/ -H "Cookie: ..."`: o navegador não deve enviar o cookie em HTTP.
  3. Teste unitário: com `NODE_ENV=production` e `BETTER_AUTH_URL=http://...`, `createAuth()` deve lançar erro.
  4. Conferir que o link do e-mail de redefinição começa com `https://<SITE_HOST>`.

---

### SEC-002 — MySQL sem TLS obrigatório e usuários sem `REQUIRE SSL`

- **Severidade:** Medium
- **Categoria:** A02:2021 e A05:2021 (contraria a RNF16 e a `ARCHITECTURE.md` §5).
- **Arquivo e localização:**
  - `docker-compose.yml:83-91`: flags do `mysqld` sem `--require-secure-transport=ON`.
  - `deploy/mysql/init/01-users.sh:8-22`: `atelier_app`, `atelier_migrate` (`ALL PRIVILEGES`) e `atelier_backup` em `'%'`, sem `REQUIRE SSL`.
- **Descrição técnica:** a documentação diz que o MySQL exige TLS em conexões vindas da rede (`require_secure_transport=ON`), mas o servidor roda com essa opção desligada, e só o usuário `dev` tem `REQUIRE SSL`. O usuário de migração aceita conexões de qualquer host (`%`), com DDL. Como `MYSQL_PUBLISH_ADDR=0.0.0.0` é uma opção documentada para abrir o banco à LAN, a credencial com mais privilégio passaria a aceitar conexão sem TLS pela rede.
- **Cenário de exploração:** com o banco aberto à LAN, um cliente conecta como `atelier_migrate` com `--ssl-mode=DISABLED`. Um atacante na rede captura a autenticação e as consultas, ou faz downgrade e MITM.
- **Impacto:** exposição de dados pessoais e de credenciais em trânsito, e possível alteração do schema (DDL).
- **Evidência (consulta somente leitura no container):**
  ```
  require_secure_transport   OFF
  atelier_app      %   (ssl_type vazio)
  atelier_backup   %   (ssl_type vazio)
  atelier_migrate  %   (ssl_type vazio)
  ```
- **Recomendação:** ligar `require_secure_transport`, exigir `REQUIRE SSL` em todos os usuários de rede e restringir `atelier_migrate` à rede do Docker ou a `localhost`.
- **Correção proposta:**
  ```yaml
  # docker-compose.yml (db.command)
      - --require-secure-transport=ON
  ```
  ```sql
  -- nova migração de infraestrutura (script idempotente em deploy/mysql/init + runbook para volumes existentes)
  ALTER USER 'atelier_app'@'%'     REQUIRE SSL;
  ALTER USER 'atelier_migrate'@'%' REQUIRE SSL;
  ALTER USER 'atelier_backup'@'%'  REQUIRE SSL;
  ```
  No `backup.sh`, adicionar `--ssl-mode=REQUIRED` ao `mysqldump`.
- **Teste de validação:**
  1. `mysql -h 127.0.0.1 -u atelier_app --ssl-mode=DISABLED` deve falhar com `ERROR 3159 (HY000)`.
  2. `SHOW VARIABLES LIKE 'require_secure_transport'` deve retornar `ON`.
  3. O app (`DATABASE_TLS=required`) e o backup continuam funcionando, e `/api/health` responde 200.

---

### SEC-003 — Container do app recebe todos os segredos (root, migração, backup, túnel, seed)

- **Severidade:** Medium
- **Categoria:** A05:2021 e menor privilégio (ASVS 14.1); contraria a regra "o app usa um usuário sem DDL".
- **Arquivo e localização:**
  - `docker-compose.yml:37-43`: `env_file: .env` mais `MIGRATION_DATABASE_URL`.
  - `deploy/app/entrypoint.sh:8-11`: `exec node server.js` herda todo o ambiente.
- **Descrição técnica:** o `env_file: .env` injeta **todas** as variáveis no processo Next.js. Com isso, um RCE, um SSRF para `/proc/self/environ` ou uma dependência comprometida no app dá acesso a credenciais de outros serviços. Além disso, a `MIGRATION_DATABASE_URL` (com DDL) continua no ambiente do servidor web depois do `migrate deploy`, o que anula a separação entre o usuário do app e o de migração.
- **Cenário de exploração:** uma vulnerabilidade de execução de código no app, ou um pacote npm malicioso, lê `process.env`. Com isso o atacante obtém `MYSQL_MIGRATE_PASSWORD`, apaga tabelas e gatilhos de auditoria (que são imutáveis só para o usuário do app) e obtém `CLOUDFLARE_TUNNEL_TOKEN`, com o qual sequestra o túnel público.
- **Impacto:** escalada de privilégio no banco (DDL e remoção dos gatilhos de auditoria) e comprometimento de serviços externos.
- **Evidência (só nomes, via `docker compose exec app env | cut -d= -f1`):**
  ```
  MIGRATION_DATABASE_URL, MYSQL_ROOT_PASSWORD, MYSQL_MIGRATE_PASSWORD, MYSQL_BACKUP_PASSWORD,
  MYSQL_DEV_PASSWORD, CLOUDFLARE_TUNNEL_TOKEN, SEED_PASSWORD, ... (presentes no container app)
  ```
- **Recomendação:** passar ao app apenas as variáveis de que ele precisa, rodar a migração num serviço *one-shot* separado e remover `MIGRATION_DATABASE_URL` antes de iniciar o servidor.
- **Correção proposta:**
  ```yaml
  # docker-compose.yml
  migrate:
    build: .
    entrypoint: ["sh", "-c", "cd ./migrate && node ./node_modules/prisma/build/index.js migrate deploy"]
    environment:
      MIGRATION_DATABASE_URL: mysql://atelier_migrate:${MYSQL_MIGRATE_PASSWORD}@db:3306/atelier_bureau
    depends_on: { db: { condition: service_healthy } }
    restart: "no"
  app:
    # sem env_file: lista explícita
    environment:
      DATABASE_URL: mysql://atelier_app:${MYSQL_APP_PASSWORD}@db:3306/atelier_bureau
      BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
      BETTER_AUTH_URL: ${BETTER_AUTH_URL}
      DATA_ENCRYPTION_KEY: ${DATA_ENCRYPTION_KEY:?}
      MERCADOPAGO_ACCESS_TOKEN: ${MERCADOPAGO_ACCESS_TOKEN}
      # ... (SMTP_*, NFE_*, CORREIOS_*, CARRIER_*, MERCADOPAGO_*)
    depends_on: { migrate: { condition: service_completed_successfully } }
  ```
  Se a migração continuar no `entrypoint.sh`, usar `exec env -u MIGRATION_DATABASE_URL node server.js`.
- **Teste de validação:** `docker compose exec app sh -c 'env | cut -d= -f1'` não deve listar `MYSQL_ROOT_PASSWORD`, `MIGRATION_DATABASE_URL`, `CLOUDFLARE_TUNNEL_TOKEN`, `SEED_PASSWORD` nem `MYSQL_*_PASSWORD`. Depois, testar `docker compose up -d` numa máquina limpa (CLAUDE.md §8).

---

### SEC-004 — Cadastro PJ não comprova vínculo com o CNPJ (sequestro da conta corporativa)

- **Severidade:** Medium
- **Categoria:** A04:2021 (design inseguro) e API6:2023 (fluxo de negócio sensível sem controle). Afeta o RF09.
- **Arquivo e localização:** `features/access/sign-up/action/sign-up.ts:80-105` (unicidade do CNPJ e consulta da situação na BrasilAPI) e `:131-152` (cria a organização com o usuário como `admin,approver`). O Better Auth também não exige verificação de e-mail (`auth.ts:39-58`).
- **Descrição técnica:** o cadastro PJ só checa se o CNPJ está **ativo** na Receita (dado público) e se ainda não foi usado. Qualquer pessoa pode abrir a conta corporativa de uma empresa real e virar administradora e aprovadora dela. A empresa legítima passa a receber "Este CNPJ já tem uma conta. Peça um convite ao administrador da empresa." O e-mail também não é verificado, então nem o domínio do e-mail comprova o vínculo.
- **Cenário de exploração:**
  1. O atacante consulta o CNPJ de um concorrente ou cliente grande (dado público) e se cadastra como PJ com um e-mail qualquer.
  2. Pede crédito faturado em nome da empresa (`/admin/financeiro/credito` analisa a razão social da Receita) e faz pedidos, cotações e chamados em nome dela.
  3. A empresa real fica bloqueada de se cadastrar.
- **Impacto:** fraude por personificação (crédito faturado, RN10), negação de serviço comercial para o cliente B2B legítimo e dano reputacional.
- **Evidência:**
  ```ts
  // sign-up.ts:81-92
  const cnpjInUse = await prisma.organization.findUnique({ where: { cnpj: data.cnpj } })
  if (cnpjInUse) throw new AppError("Este CNPJ já tem uma conta. Peça um convite ...")
  const lookup = await lookupCnpj(data.cnpj)   // só situação cadastral
  ```
- **Recomendação:**
  1. Criar a organização com o status "pendente de verificação" e bloquear o faturado e a aprovação de crédito até a validação manual pelo comercial ou financeiro (contrato social, cartão CNPJ ou e-mail no domínio corporativo).
  2. Exigir verificação de e-mail (`emailVerification` do Better Auth, com `requireEmailVerification: true`) antes de liberar o pedido B2B.
  3. Oferecer um fluxo de contestação ("Esta empresa é minha") para o titular legítimo.
- **Correção proposta (resumo):**
  ```ts
  // sign-up.ts — ao criar a organização
  await tx.organization.create({ data: { ..., verificationStatus: "PENDING" } })
  // credit-service / checkout: recusar INVOICED quando verificationStatus !== "VERIFIED"
  ```
  É uma mudança de requisito e de schema: registrar RN/NC nova (CLAUDE.md §11) e criar a migration.
- **Teste de validação:** teste de integração em que o cadastro PJ cria a organização `PENDING`, `placeOrder` com `INVOICED` é recusado e `updateCorporateCredit` exige `VERIFIED`. E2E: o e-mail não verificado não acessa o checkout B2B.

---

### SEC-005 — Sem bloqueio por conta no login e no TOTP (rate limit só por IP, em memória)

- **Severidade:** Medium
- **Categoria:** A07:2021 (falhas de identificação e autenticação), API4:2023 (consumo irrestrito de recursos), ASVS 2.2.1.
- **Arquivo e localização:**
  - `proxy.ts:45-71` e `features/shared/lib/rate-limit/rate-limit.ts:358-363`: regra "auth" de 10 POST/min **por IP**, em memória.
  - `features/access/sign-in/action/sign-in.ts:31-89`: `signIn` e `verifyTwoFactor` não têm limite por conta.
  - O plugin `twoFactor` do Better Auth 1.7.20 não limita as tentativas de TOTP: `TOO_MANY_ATTEMPTS` só existe para OTP.
- **Descrição técnica:** o único freio é por IP. Não há contador por e-mail nem bloqueio progressivo. As actions chamam `auth.api.*` direto, então o rate limiter interno do Better Auth (que só atua no handler HTTP) não se aplica. O limitador é em memória, zera a cada restart e é contornado por um atacante distribuído (vários IPs ou IPv6).
  > Teste: invocar a action `signIn` por outro caminho (`POST /produto/x` com o cabeçalho `Next-Action`) a executou (`{"success":false,"error":"E-mail ou senha incorretos."}`). Depois de esgotar a cota em `/entrar`, as invocações por outros caminhos passaram a não retornar resultado, o que indica que o Next.js encaminha a action internamente para a rota de origem e o limite por IP acaba valendo. Mesmo assim, o limite continua só por IP.
- **Cenário de exploração:** credential stuffing distribuído contra `financeiro@...`, com 10 tentativas por minuto por IP e N IPs. Com a senha em mãos, um ataque de força bruta ao TOTP ainda testa 10 códigos por minuto por IP, sem bloqueio da conta.
- **Impacto:** tomada de conta (inclusive de perfis internos), sem alerta nem bloqueio.
- **Evidência:**
  ```
  POST /entrar (signIn) x12  -> 200 x10, 429 x2
  rate-limit.ts: { name: "auth", paths: ["/entrar", ...], rule: { limit: 10, windowMs: 60_000 } }
  ```
- **Recomendação:** criar um limite persistente **por conta** (o projeto já tem `enforcePersistentRateLimits` na tabela `rate_limit_buckets`): no máximo 5 falhas em 15 min por e-mail e 5 falhas de TOTP por desafio, com auditoria (RNF12) e e-mail de alerta ao titular.
- **Correção proposta:**
  ```ts
  // sign-in.ts
  await enforcePersistentRateLimits(
    [
      { scope: "auth.account", subject: parsed.data.email.toLowerCase() },
      { scope: "auth.ip", subject: (await getClientIp()) ?? "unknown" },
    ],
    { userId: null, action: "signIn" }
  )
  // verifyTwoFactor: escopo "auth.totp" com subject = hash do cookie two_factor
  ```
  Adicionar os escopos `auth.account`, `auth.ip` e `auth.totp` ao `rate-limit-schema.ts` e ao seed (valores configuráveis, CLAUDE.md §7).
- **Teste de validação:** teste de integração em que 6 senhas erradas para o mesmo e-mail, vindas de IPs diferentes (cabeçalho mockado), fazem a 6ª retornar `RATE_LIMITED_MESSAGE` e gravam `security.rate_limited` na auditoria. Fazer o mesmo para 6 códigos TOTP errados.

---

### SEC-006 — `/api/csp-report` lê o corpo sem limite quando não há `Content-Length`

- **Severidade:** Medium
- **Categoria:** API4:2023 (consumo irrestrito de recursos), A05:2021. É uma DoS sem autenticação.
- **Arquivo e localização:** `app/api/csp-report/route.ts:17-19`.
- **Descrição técnica:**
  ```ts
  const length = Number(request.headers.get("content-length") ?? "0")
  if (length <= CSP_REPORT_MAX_LENGTH) {
    const body = await request.text()   // lê tudo
  ```
  Numa requisição com `Transfer-Encoding: chunked`, não há `Content-Length`, então `length` vale 0 e o limite passa. O `request.text()` carrega o corpo inteiro na memória do processo Node. O Caddy não define `request_body max_size` no site principal. O rate limit "api" (120/min por IP) não ajuda, porque uma única requisição grande basta.
- **Cenário de exploração:** `curl -k -H "Transfer-Encoding: chunked" --data-binary @2GB.bin https://<ip>/api/csp-report` derruba o container `app` por falta de memória, e o `restart: unless-stopped` entra em laço. A mesma ideia vale para `app/api/webhooks/mercadopago/route.ts:48`, que lê o texto antes de checar `MAX_BODY_BYTES` (o gate do túnel limita a 16 KB, mas a rota também é acessível pela LAN, pelo Caddy principal).
- **Impacto:** indisponibilidade da loja (RNF01).
- **Evidência:** trecho acima (análise de código; o teste destrutivo não foi executado).
- **Recomendação:** ler o corpo em streaming com teto de bytes, e também limitar no Caddy.
- **Correção proposta:**
  ```ts
  // features/shared/lib/request/read-limited-body.ts
  export async function readLimitedText(request: Request, max: number): Promise<string | null> {
    const reader = request.body?.getReader()
    if (!reader) return ""
    const chunks: Uint8Array[] = []
    let total = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > max) { await reader.cancel(); return null }
      chunks.push(value)
    }
    return new TextDecoder().decode(Buffer.concat(chunks))
  }
  ```
  ```caddy
  # deploy/caddy/Caddyfile, no site principal
  @api path /api/*
  request_body @api { max_size 64KB }
  ```
- **Teste de validação:** teste unitário em que um `Request` com stream de 1 MB e sem `content-length` faz `readLimitedText` retornar `null`, a rota responde 204 sem ler tudo e o uso de memória fica estável. No servidor, um POST chunked de 10 MB em `/api/csp-report` deve receber 413 do Caddy.

---

### SEC-007 — CSP com `script-src 'unsafe-inline'` em todas as páginas, exceto a de pagamento

- **Severidade:** Low
- **Categoria:** A05:2021 (defesa em profundidade contra XSS).
- **Arquivo e localização:** `features/shared/lib/security/headers.ts:130-140` (`buildContentSecurityPolicy`) e `next.config.ts:138-147`.
- **Descrição técnica:** a CSP estática permite scripts inline. Se surgir um XSS (hoje nenhum sink explorável foi encontrado), a CSP não o contém. A página de pagamento já usa nonce (#173).
- **Cenário de exploração:** um XSS futuro (por exemplo, num componente novo com HTML do back office) executa sem bloqueio e rouba dados da página ou faz ações em nome do usuário.
- **Impacto:** perda de uma camada de defesa.
- **Evidência:** `curl -skI https://localhost/` retorna `script-src 'self' 'unsafe-inline' https://sdk.mercadopago.com ...`
- **Recomendação:** estender o nonce do `proxy.ts` a todas as rotas dinâmicas (o Next 16 aplica o nonce aos próprios scripts) ou usar hashes nas páginas estáticas, com `'strict-dynamic'`.
- **Correção proposta:** em `proxy.ts`, aplicar `buildPaymentContentSecurityPolicy(isDev, nonce)` a todas as rotas HTML (renomeando-a para `buildNonceContentSecurityPolicy`) e remover a regra estática do `next.config.ts`.
- **Teste de validação:** `npm run security:payment-page` adaptado para todas as rotas; a CSP de `/` não pode conter `'unsafe-inline'` em `script-src`; E2E sem violações no `/api/csp-report`.

### SEC-008 — Assinatura do webhook sem janela de tempo (replay)

- **Severidade:** Low
- **Arquivo e localização:** `features/shared/lib/mercadopago/mercadopago.ts:440-471` (`ts` usado só no manifesto).
- **Descrição técnica:** a assinatura é validada, mas `ts` não é comparado com o relógio. Uma notificação capturada pode ser reenviada indefinidamente. O impacto é baixo porque o processamento relê `GET /v1/payments/{id}` e é idempotente pelo `x-request-id`.
- **Cenário de exploração:** reenvio em massa de notificações válidas antigas (com `x-request-id` novo), o que gera chamadas extras à API do Mercado Pago e carga no banco.
- **Impacto:** amplificação de carga e de cota da API.
- **Evidência:** `const ts = parts.get("ts")` só entra em `` `ts:${ts};` ``.
- **Recomendação e correção proposta:**
  ```ts
  const tsMs = Number(ts) * (ts.length <= 10 ? 1000 : 1)
  if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60_000) return false
  ```
- **Teste de validação:** teste unitário em que uma assinatura válida com `ts` de 10 minutos atrás é rejeitada e uma com `ts` atual é aceita.

### SEC-009 — Enumeração de contas (e-mail, CPF e vínculo corporativo)

- **Severidade:** Low
- **Categoria:** A07:2021 e API3:2023.
- **Arquivo e localização:**
  - `features/access/sign-up/action/sign-up.ts:78` ("Este CPF já tem cadastro.") e `:121-124` (e-mail já cadastrado).
  - `features/access/corporate-members/action/members-actions.ts:156-160` ("já está vinculado a outra conta corporativa") e `:540`.
- **Descrição técnica:** as mensagens revelam se um CPF ou e-mail tem conta e se um e-mail pertence a outra empresa. Qualquer PJ recém-cadastrado tem `member:manage` e pode consultar o vínculo corporativo de qualquer e-mail.
- **Cenário de exploração:** um script testa CPFs ou e-mails no cadastro (10/min por IP, multiplicado por N IPs) e monta uma lista de clientes para phishing.
- **Impacto:** vazamento de existência de cadastro (LGPD).
- **Recomendação:** responder sempre "Se os dados forem válidos, enviaremos um e-mail de confirmação", tratar o conflito por e-mail e no convite não revelar a outra empresa ("Não foi possível convidar este e-mail").
- **Correção proposta:** substituir as mensagens específicas por uma genérica e mover a decisão para um e-mail ao titular ("você já tem conta, faça login ou redefina a senha").
- **Teste de validação:** teste da action em que o cadastro com CPF existente e com CPF novo retorna a mesma estrutura de resposta, e o `inviteMember` com e-mail de outra organização retorna mensagem genérica.

### SEC-010 — Estorno faturado: o mesmo usuário solicita e aprova (sem segregação de funções)

- **Severidade:** Low
- **Categoria:** A04:2021 (controle de negócio).
- **Arquivo e localização:** `features/finance/refunds/action/refund-actions.ts:792` (`requestedById: user.id`) e `:854` (`approveRefund`, que só exige `credit:approve`). No seed, o perfil `finance` tem `payment:refund` e `credit:approve` (`prisma/seed-data.ts:380-390`).
- **Descrição técnica:** a RN07 exige a aprovação do financeiro para estornos de pedido faturado, mas o sistema deixa o próprio solicitante aprovar.
- **Cenário de exploração:** um operador financeiro mal-intencionado solicita e aprova um estorno indevido sozinho.
- **Impacto:** fraude interna. Ela fica auditada, mas não é prevenida.
- **Recomendação e correção proposta:** em `approveRefund`, ler `requestedById` e recusar quando for igual a `user.id`, salvo quando a conta interna tiver um único usuário financeiro (exceção registrada na auditoria).
  ```ts
  if (refund.requestedById === user.id) throw new AppError("O estorno precisa ser aprovado por outra pessoa do financeiro.", "self_approval")
  ```
- **Teste de validação:** teste de integração em que o usuário A solicita e o mesmo A recebe `self_approval` ao aprovar, enquanto o usuário B aprova com sucesso.

### SEC-011 — Lista de 2FA obrigatório não cobre perfis com dados pessoais ou administração; `user:manage` pode se autoconceder `admin`

- **Severidade:** Low
- **Arquivo e localização:** `features/shared/lib/auth/permissions.ts:158-164` (`TWO_FACTOR_REQUIRED_PERMISSIONS`) e `features/backoffice/internal-users/action/internal-users-actions.ts:141-150` (só impede remover o próprio `user:manage`).
- **Descrição técnica:** `user:manage`, `privacy:manage` (exportar e anonimizar titulares), `customer:read`, `audit:read` e `setting:manage` não exigem 2FA. Um perfil customizado só com `user:manage` pode conceder `admin` a si mesmo.
- **Cenário de exploração:** uma conta com `user:manage` (sem 2FA) comprometida concede `admin` a si mesma ou a uma conta do atacante. O 2FA só passa a ser exigido depois, e o atacante ativa o próprio autenticador (ver SEC-013).
- **Impacto:** escalada de privilégio interna.
- **Recomendação e correção proposta:** incluir `user:manage`, `privacy:manage`, `customer:read`, `audit:read` e `setting:manage` em `TWO_FACTOR_REQUIRED_PERMISSIONS`. Impedir a autoconcessão de perfis que o usuário ainda não tem: `if (target.id === user.id && keys.some(k => !before.includes(k))) throw ...`.
- **Teste de validação:** teste unitário em que `requiresTwoFactor(new Set(["user:manage"]))` retorna `true`, e teste de integração em que a autoconcessão de `admin` é recusada.

### SEC-012 — Sessão de 7 dias, renovável, sem reautenticação em ações críticas

- **Severidade:** Low
- **Arquivo e localização:** `features/shared/lib/auth/auth.ts:66-76` (sem `expiresIn` nem `updateAge`; o padrão do Better Auth é 7 dias, renovado diariamente).
- **Descrição técnica:** perfis internos com estorno e cancelamento mantêm a sessão por semanas se usarem o sistema todos os dias. Ações como `approveRefund`, `setInternalUserRoles` e `anonymizeSubject` não pedem senha ou TOTP de novo.
- **Cenário de exploração:** uma sessão roubada (SEC-001) ou um computador desbloqueado no balcão permitem ações críticas por dias.
- **Recomendação e correção proposta:** `session: { expiresIn: 8 * 3600, updateAge: 3600 }` para perfis internos (ou para todos), mais step-up com TOTP nas actions de estorno, gestão de usuários e LGPD.
- **Teste de validação:** o cookie deve ter `Max-Age=28800`, e um teste de action confirma que `approveRefund` sem o código TOTP recente é recusado.

### SEC-013 — Cadastro do 2FA adiado: quem tiver a senha cadastra o próprio autenticador

- **Severidade:** Low
- **Arquivo e localização:** `features/access/security/action/two-factor.ts:121-169` e `features/shared/lib/db/page-guard.ts:507-521` (redireciona para `/conta/seguranca`).
- **Descrição técnica:** quando um perfil interno recebe permissão que exige 2FA, o primeiro login, que só exige a senha, pode ativar o 2FA com qualquer autenticador. Um atacante com a senha (vazada ou de seed) faz isso antes do titular e fica com o fator.
- **Recomendação e correção proposta:** ao conceder um perfil interno, gerar um convite de ativação de 2FA de uso único, enviado por e-mail ao titular (ou feito presencialmente pelo administrador), e bloquear `startTwoFactor` sem esse token quando `required === true`.
- **Teste de validação:** teste de integração em que um usuário com `order:read` sem 2FA chama `startTwoFactor` sem o token de ativação e recebe `forbidden`.

### SEC-014 — Backups sem criptografia e senha do MySQL na linha de comando

- **Severidade:** Low
- **Arquivo e localização:** `deploy/backup/backup.sh:21-23`.
- **Descrição técnica:** o `mysqldump -p"${MYSQL_BACKUP_PASSWORD}" | gzip` grava em `./backups` dumps em texto claro, com nome, e-mail, endereço e auditoria. O CPF e o telefone vão criptografados. A senha aparece em `ps` dentro do container.
- **Recomendação e correção proposta:** usar `MYSQL_PWD` ou `--defaults-extra-file`, e criptografar o dump (`| gzip | openssl enc -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY` ou `age`), com permissão `0600`.
- **Teste de validação:** `ps aux` no container não mostra a senha, e o arquivo em `./backups` não abre com `zcat` sem a chave.

### SEC-015 — TLS do app com o MySQL sem verificação de certificado (padrão `required`)

- **Severidade:** Low
- **Arquivo e localização:** `features/shared/lib/db/connection-config.ts:83-85` (`rejectUnauthorized: false`).
- **Descrição técnica:** a conexão é cifrada, mas aceita qualquer certificado, então um MITM na rede do Docker é possível. O risco é baixo porque o tráfego fica numa rede interna.
- **Recomendação e correção proposta:** usar `DATABASE_TLS=verify` com `DATABASE_TLS_CA` apontando para o `ca.pem` do volume do MySQL no compose.
- **Teste de validação:** com uma CA errada, o app falha ao conectar; com a CA correta, `/api/health` responde 200.

### SEC-016 — Mensagens de erro do Prisma no log podem conter dados pessoais

- **Severidade:** Low
- **Arquivo e localização:** `features/shared/lib/errors/action-result.ts:52` e `features/shared/lib/logger/logger.ts:33-35` (`{ name, message }` de qualquer `Error`).
- **Descrição técnica:** a redação mascara chaves sensíveis, mas a `message` de erros do Prisma (por exemplo, de validação) reproduz os argumentos da consulta, como e-mail ou endereço, e vai para o log sem filtro.
- **Recomendação e correção proposta:** para erros que não são `AppError`, registrar só `name`, `code` (`P2002` etc.) e `meta.modelName`, e descartar a `message`:
  ```ts
  if (value instanceof Error) return { name: value.name, code: (value as {code?:string}).code }
  ```
- **Teste de validação:** teste unitário em que `redact(new PrismaClientValidationError("... email: 'a@b.c' ..."))` não contém `@`.

### SEC-017 — Imagens de produtos em rascunho servidas publicamente

- **Severidade:** Low
- **Arquivo e localização:** `app/media/[...key]/route.ts:32-44` (só os PDFs checam o status do produto).
- **Descrição técnica:** as imagens WebP de produtos `DRAFT`, `INACTIVE` ou excluídos ficam acessíveis a quem souber a chave, com cache `immutable` de um ano. Isso pode vazar lançamentos. As chaves têm UUID, o que dificulta a descoberta.
- **Recomendação e correção proposta:** aplicar a mesma checagem de `canReadProductDocument` às imagens (procurando `productImage.storageKey` pelo prefixo), com `Cache-Control: private` quando o produto não estiver publicado.
- **Teste de validação:** com uma imagem de produto `DRAFT` e um visitante sem login, a rota responde 404.

### SEC-018 — `bodySizeLimit` de 11 MB vale para todas as Server Actions

- **Severidade:** Low
- **Arquivo e localização:** `next.config.ts:17`.
- **Descrição técnica:** o limite pensado para o upload de imagens do back office vale também para actions públicas (`signIn`, `addToCart`, `lookupAddressByCep`), que passam a aceitar 11 MB por requisição sem autenticação.
- **Recomendação e correção proposta:** baixar o limite global para 1 MB e fazer o upload de imagens do back office por uma rota dedicada (`app/api/admin/uploads`), autenticada e com `request_body max_size` no Caddy. Outra opção é limitar por caminho no Caddy (`/admin/*` com 11 MB e o resto com 1 MB).
- **Teste de validação:** um POST de 2 MB numa action pública deve receber 413.

### SEC-019 — Reserva de estoque sem limite de pedidos pendentes por cliente

- **Severidade:** Low
- **Categoria:** API6:2023 (abuso de fluxo de negócio).
- **Arquivo e localização:** `features/payment/checkout/action/checkout-actions.ts:629-700`, onde o `placeOrder` reserva estoque até expirar (RN14), com limite de 10/min só por IP.
- **Descrição técnica:** uma conta, ou várias, pode criar pedidos PIX ou boleto em série e segurar todo o estoque de um SKU até a expiração.
- **Recomendação e correção proposta:** limitar os pedidos `AWAITING_PAYMENT` por usuário e por organização (por exemplo, 3, valor configurável no seed) e aplicar `enforcePersistentRateLimits` por usuário no `placeOrder`.
- **Teste de validação:** o 4º pedido pendente do mesmo usuário é recusado com mensagem genérica.

### SEC-020 — Dependências: 23 alertas High (dev/tooling), imagens Docker sem versão fixa e `shadcn` em `dependencies`

- **Severidade:** Low
- **Arquivo e localização:** `package.json:44` (`shadcn` em `dependencies`) e `docker-compose.yml:11,134,159,178` (`caddy:2`, `louislam/uptime-kuma:1`, `cloudflare/cloudflared:latest`).
- **Descrição técnica:**
  - `npm audit`: 23 vulnerabilidades **High**, todas transitivas de `picomatch <= 4.0.7` (ReDoS, GHSA-fc5q-39xc-vjpf), vindas de `vitest`, `eslint-config-next`, `eslint-plugin-jsdoc`, `@vitest/coverage-v8` e `shadcn`. Nenhuma está no caminho de runtime: o build `standalone` só rastreia módulos usados, e `next` e `better-auth` não aparecem.
  - A CLI do `shadcn` está em `dependencies`.
  - Tags móveis (`latest`, `2`, `1`) permitem que uma imagem atualizada ou comprometida entre sem revisão.
- **Recomendação e correção proposta:** mover o `shadcn` para `devDependencies`; usar `overrides` com `"picomatch": "^4.0.8"` (ou a versão corrigida) quando disponível, ou aguardar os upstreams; fixar as imagens por digest (`caddy:2.10.2@sha256:...`, `cloudflare/cloudflared:2026.x.y@sha256:...`); habilitar o Dependabot.
- **Teste de validação:** `npm audit --omit=dev` retorna 0; `docker compose config` não mostra `:latest`.

---

## 3. Vulnerabilidades suspeitas (precisam de verificação)

### SUS-001 — Docker Desktop mascara o IP do cliente: rate limit global, IP de auditoria inútil e `private_ranges` ineficaz

- **Severidade estimada:** Medium
- **Arquivo e localização:** `proxy.ts:27-30`, `features/shared/lib/request/client-ip.ts` e `deploy/caddy/Caddyfile:46-47`.
- **Hipótese:** o servidor roda em **Docker Desktop** (confirmado: `docker info` retorna `Docker Desktop | 29.9.3`). A própria `ARCHITECTURE.md` §5.1 registra que, nesse ambiente, as conexões pela porta publicada chegam com o IP do gateway. Se isso também valer para o Caddy, o `X-Forwarded-For` de **todos** os clientes é o mesmo. Nesse caso:
  1. 10 tentativas de login por minuto valem para a rede inteira, e um único cliente bloqueia o login de todos (DoS).
  2. A coluna `ip` da auditoria (RNF12) e as chaves de `rate_limit_buckets` não distinguem ninguém.
  3. A restrição `not remote_ip private_ranges` do painel 3001 sempre passa.
- **Verificação:** a partir de dois dispositivos da LAN, fazer uma ação auditada em cada um e comparar a coluna `ip` da tabela de auditoria (`SELECT ip, COUNT(*) FROM audit_logs GROUP BY ip`). Outra opção: ligar o `log` do Caddy temporariamente e conferir `remote_ip`. Também dá para disparar 10 POSTs em `/entrar` de um dispositivo e verificar se outro recebe 429.
- **Correção, se confirmado:** rodar o servidor com rede `host` em Docker Engine sobre Linux/WSL2 (mirrored networking), ou somar limites por conta (SEC-005) para não depender do IP. Documentar a limitação.

### SUS-002 — Contas do seed com senha conhecida no servidor de entrega

- **Severidade estimada:** Medium
- **Arquivo e localização:** `prisma/seed.ts:37` (senha padrão literal quando falta `SEED_PASSWORD`) e `prisma/seed-data.ts:658-700` (contas `admin@`, `financeiro@` etc. com domínio `.test`).
- **Hipótese:** o seed já rodou neste servidor. Se `scripts/rotate-seed-accounts.ts` não tiver sido executado (checklist #179), as contas internas aceitam a senha do seed, conhecida por todo o time, ou a senha padrão versionada no repositório. O 2FA obrigatório do `admin` ajuda, mas ver SEC-013: quem entra primeiro cadastra o autenticador.
- **Verificação:** `npx tsx scripts/rotate-seed-accounts.ts --dry-run` no servidor, que lista quais contas ainda têm a senha do seed.
- **Correção:** executar a rotação (`--disable` para as contas que não forem usadas na demonstração), remover o fallback literal do `seed.ts` (falhar sem `SEED_PASSWORD`) e bloquear `db:seed` quando `NODE_ENV=production`.

### SUS-003 — Open redirect pós-login com caracteres de controle

- **Severidade estimada:** Low
- **Arquivo e localização:** `features/shared/lib/validation/documents.ts:88-97` (`safeRedirectPath`) e `features/access/sign-in/sign-in-view.tsx:52` (`router.push`).
- **Hipótese:** `/\t/evil.example` (ou com `\n`) passa pelas checagens (não começa com `//` nem contém `\`). O parser de URL do navegador remove TAB e LF, o que vira `//evil.example`, uma URL relativa ao protocolo.
- **Verificação:** com autorização para usar o navegador, abrir `https://<ip>/entrar?redirect=%2F%09%2Fexample.com`, fazer login e ver se a navegação sai do domínio.
- **Correção:** validar com `new URL(value, "https://x.invalid")` e exigir `url.origin === "https://x.invalid"`, além de rejeitar `/[\u0000-\u001f\u007f]/`.

### SUS-004 — Webhook do Mercado Pago desligado

- **Severidade estimada:** Low (informativo)
- **Evidência:** `POST https://localhost/api/webhooks/mercadopago` retornou **503**, o que indica `MERCADOPAGO_WEBHOOK_SECRET` vazia. Nesse estado, o pedido só é confirmado pela reconciliação (RN13 continua valendo).
- **Verificação e correção:** se a demonstração usar o túnel, configurar o segredo no painel do Mercado Pago e no `.env`, e testar com a notificação de teste do painel.

### SUS-005 — Bomba de descompressão de imagem (sharp) no upload do back office

- **Severidade estimada:** Low
- **Arquivo e localização:** `features/shared/lib/images/process-image.ts:44,79`, sem `limitInputPixels` explícito (o padrão do sharp é cerca de 268 MP) e com até 20 recodificações por largura.
- **Verificação:** enviar como `admin` um PNG de 16000×16000 pixels com cerca de 1 MB e medir CPU e RAM.
- **Correção:** `sharp(input, { limitInputPixels: 40_000_000 })` e checar `metadata.width * metadata.height`.

### SUS-006 — Anexos PDF de clientes (chamados e cotações) abertos pela equipe

- **Severidade estimada:** Low
- **Arquivo e localização:** `features/shared/lib/support/ticket-files.ts:36-70` (só a assinatura `%PDF-` é validada).
- **Hipótese:** um PDF malicioso (exploit do leitor ou link de phishing) chega ao atendimento. O arquivo é baixado e aberto fora do contexto do site.
- **Verificação e correção:** antivírus (ClamAV) no upload e, opcionalmente, rasterizar ou sanitizar os PDFs (por exemplo, `qpdf --linearize` com remoção de `/JavaScript` e `/OpenAction`).

---

## 4. Controles verificados que passaram

| Área | O que foi verificado | Resultado |
|---|---|---|
| SQL injection | Todos os 27 `$queryRaw` (`catalog-query.ts:76`, `stock-service.ts:35`, `order-number.ts:19`, `payment-sync.ts:130` etc.) usam *tagged template* com parâmetros e `Prisma.join`. Não há `$queryRawUnsafe`, `$executeRawUnsafe` nem `Prisma.raw`. O `LIKE` usa `escapeLike`. | OK |
| XSS | O único `dangerouslySetInnerHTML` (`produto/[slug]/page.tsx:80`) é JSON-LD com `serializeJsonLd`, que escapa `<`. O conteúdo institucional é renderizado por `RichText` como texto React. O `ctaHref` da home aceita só caminho interno (regex `^\/[^/\\]`). Os e-mails usam `escapeHtml` em todos os campos. | OK |
| CSRF | Server Actions com `Origin: https://evil.example` foram rejeitadas (HTTP 500 com digest, sem executar). O handler HTTP do Better Auth **não está montado** (não existe `app/api/auth`), então só há chamadas `auth.api.*` no servidor. Cookies com `SameSite=Lax`. | OK |
| CORS | Nenhuma rota emite `Access-Control-Allow-*`. A política é same-origin. | OK |
| BOLA/IDOR | Escopo por sessão em endereços (`ownerWhere`), pedidos (`loadOwnOrder`, `trackingScope`, `supportOrderScope`), cotações (`customerQuoteScope`), chamados e anexos (`supportTicketScope`), pagamentos (`order: { id, userId }`), listas de projeto, favoritos, carrinho (`activeCartWhere`), aprovações (`organizationId` do contexto) e membros e convites (`organizationId` do contexto). Nenhum id de usuário vem do request. | OK |
| Controle de acesso no back office | Todas as actions administrativas chamam `requirePermission`. Todas as páginas `app/admin/**` usam `requirePagePermission` ou `requireBackOfficePage` (a home e o menu via view). O acesso sem login a `/admin/usuarios` retorna só `NEXT_REDIRECT` para `/entrar`, sem dados. `/admin/produtos/importar/modelo` retorna 401 e `/admin/nfe/...` retorna 404. | OK |
| 2FA obrigatório (#177) | `assertTwoFactor` roda em todo `requirePermission`. `twoFactorVerified` é gravado só pelo hook (`input: false`). `trustDevice` é descartado pelo Zod (`two-factor-code-schema`). Perfis obrigatórios não podem desligar o 2FA. | OK (ver SEC-011 e SEC-013) |
| Redefinição de senha | Token de 1 h, de uso único, que revoga sessões. Link montado a partir de `BETTER_AUTH_URL` (sem *Host header injection*). Resposta idêntica para e-mail existente ou não. | OK (ver SEC-001 sobre o esquema da URL) |
| Path traversal e storage | `resolveStorageKey` usa regex, bloqueia `..` e confere o prefixo depois de `normalize`. O teste com `/media/products/..%2f..%2f.env.webp` retornou 404. Os PDFs de produto não publicado exigem `product:read`. Os anexos privados (`support/`, `quotes/`) ficam fora da rota `/media`. | OK |
| Upload | Assinatura (magic bytes) para PDF, PNG, JPEG e WebP. Tamanho de 5 MB por arquivo e 10 MB no total. Nome higienizado. Chave gerada no servidor (UUID). Imagens reprocessadas pelo sharp para WebP. | OK |
| Webhook (RN13) | HMAC-SHA256 com `timingSafeEqual`. Idempotência por `x-request-id`, com `FOR UPDATE` na notificação. O pagamento é relido na API. O pedido só é confirmado com `approved` **e** valor igual em centavos (`AMOUNT_MISMATCH_DETAIL`). Corpo de até 16 KB no gate do túnel, que expõe só `POST /api/webhooks/mercadopago`. | OK (ver SEC-008 e SEC-006) |
| Integridade transacional | Pedido, estoque, estorno, crédito, faturado, cotação e agenda usam `prisma.$transaction` com `SELECT ... FOR UPDATE` (`lockStockRows` em ordem de `sku_id`, o que evita deadlock). | OK |
| Rate limit de pagamento e estorno | `enforcePersistentRateLimits` persistente por pedido, IP e usuário, com auditoria da primeira recusa (#175). Ações públicas (CEP, frete, cupom, chamado, cotação, LGPD) têm limite em memória. | OK (ver SEC-005) |
| SSRF | ViaCEP, BrasilAPI, Correios, transportadora e NF-e usam base URL do ambiente. O CEP e o CNPJ chegam reduzidos a dígitos e validados (`cepSchema`, `isValidCnpj`). Nenhuma URL vem do usuário. | OK |
| Criptografia (RNF03) | AES-256-GCM com chaves derivadas por HKDF-SHA256 (separação entre chave de cifra e chave de IV). IV determinístico de 96 bits obtido por HMAC do valor (construção tipo SIV, que vaza só igualdade, necessária para o `UNIQUE` do CPF). A produção recusa iniciar sem `DATA_ENCRYPTION_KEY` de 32 bytes. Senhas com hash do Better Auth (scrypt). | OK |
| Segredos no repositório | `.env*` está no `.gitignore` e no `.dockerignore`. A varredura do histórico (`APP_USR-`, `TEST-`, `password=`, `secret`, chaves privadas, AWS, GitHub) encontrou só *fixtures* de teste (`APP_USR-1234...`, `TEST-0000`, segredo fictício em `tests/payment/webhook.test.ts`) e o fallback do seed (SUS-002). `backups/`, `storage/` e `*.zip` são ignorados. | OK |
| Cabeçalhos HTTP | HSTS (1 ano), `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP e CORP `same-origin`, sem `Server` nem `X-Powered-By`. A porta 80 responde 308 para HTTPS. A CSP com nonce na página de pagamento é reportada em `/api/csp-report`. | OK (ver SEC-007) |
| Erros (RNF05) | `toActionError` devolve uma mensagem genérica e nunca o stack trace. `/api/health` não mostra detalhe interno. O logger mascara as chaves sensíveis e o `x-request-id` é gerado no servidor. | OK (ver SEC-016) |
| Docker e MySQL | O app roda como `nextjs` (não root). O MySQL publica só em `127.0.0.1`. O `root` fica restrito a `localhost`. `atelier_app` só tem DML. `local_infile=OFF`. TLS 1.2 e 1.3. O painel 3001 só aceita faixas privadas. O túnel fica isolado numa rede própria com o gate. | OK (ver SEC-002, SEC-003 e SUS-001) |
| Cookie do carrinho de visitante | Token aleatório de 256 bits, `httpOnly`, `SameSite=Lax` e `Secure` em produção. | OK |
| Trava de sandbox do Mercado Pago | Credenciais que não começam com `TEST-` são recusadas sem `MERCADOPAGO_ALLOW_PRODUCTION=true`. | OK |
| Validação de entrada | 140 das 156 actions validam com Zod (`safeParse` ou `parse`). As que não validam não recebem input (`list*`, `get*`) ou validam com checagem equivalente (`importProducts`: tipo, tamanho e `parseImportRows`; `lookupCnpjForSignUp`: `isValidCnpj`). | OK |

---

## 5. Prioridade de correção sugerida

1. **SEC-001**, corrigida no `.env` do servidor e no `auth.ts` antes da apresentação.
2. **SUS-002**: rodar `accounts:rotate-seed`.
3. **SEC-003** e **SEC-002**, juntas, numa mudança de infraestrutura testada com `docker compose up -d` numa máquina limpa.
4. **SEC-006** (DoS sem autenticação) e **SEC-005**.
5. **SEC-004**, que exige decisão de requisito (RF09 e uma RN nova) e migration.
6. As vulnerabilidades Low, conforme o milestone.

## 6. Comandos usados (reprodutíveis, sem segredo)

```bash
npm audit --json
curl -skI https://localhost/
curl -sk -X POST https://localhost/entrar -H "Next-Action: <id da action signIn>" \
  -H "Origin: https://localhost" -H "Content-Type: text/plain;charset=UTF-8" \
  --data '[{"email":"audit-nobody@example.invalid","password":"NotARealPass123"}]'   # x12 -> 429 depois de 10
curl -sk -X POST https://localhost/produto/inexistente -H "Next-Action: <id>" -H "Origin: https://evil.example" ...   # 500, bloqueado
curl -sk -o /dev/null -w "%{http_code}" "https://localhost/media/products/..%2f..%2f.env.webp"           # 404
docker compose exec -T db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "SHOW VARIABLES LIKE \"require_secure_transport\"; SELECT user,host,ssl_type FROM mysql.user"'
docker compose exec -T app sh -c 'env | cut -d= -f1 | sort'
git log --all -p -G "<padrões de segredo>"   # saída redigida
```
