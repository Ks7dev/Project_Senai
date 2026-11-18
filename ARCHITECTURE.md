# Arquitetura — Atelier Bureau

Padrão técnico do projeto (issue #1, RNF07): stack, organização de código, regras de implementação e fluxo de trabalho. Toda contribuição segue este documento.

## 1. Stack

| Camada | Escolha |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + **TypeScript** `strict` |
| UI | **Tailwind CSS v4** (config em `app/globals.css`, sem `tailwind.config.js`), **shadcn/ui** (style `base-nova`, primitivas `@base-ui/react`), ícones **`lucide-react`** (decisão da #3) e animações por CSS (`tw-animate-css`) |
| Formulários | `react-hook-form` + `zod` + `@hookform/resolvers/zod` |
| Banco de dados (RNF16) | **MySQL 8** (InnoDB, `utf8mb4`), acessado só pelo **Prisma ORM**, que cuida do schema, das migrations e dos seeds |
| Autenticação | **Better Auth** com adapter Prisma: sessão em cookie `httpOnly`, recuperação de senha, plugin de 2FA (RF40) e plugin de organizações para contas corporativas multiusuário (RF09, RF10) |
| Arquivos | Imagens, fichas técnicas em PDF e anexos em disco local (`storage/`, volume do container `app`), pela interface de `features/shared/lib/storage/storage.ts`, servidos por `app/media/[...key]`. O banco guarda só a chave e os metadados do arquivo |
| Imagens | `sharp` no servidor: valida, converte para WebP com até 300 KB e gera versões responsivas (RNF04) |
| Qualidade | ESLint (`eslint-config-next`) + Prettier (`prettier-plugin-tailwindcss`) + `tsc --noEmit` |
| Testes (RNF07) | **Vitest**: unitários de schema, action e regras de negócio. **Playwright**: ponta a ponta do fluxo de compra |
| Documentação de código (RNF08) | **JSDoc** em toda função exportada, cobrado por `eslint-plugin-jsdoc` |
| Servidor | **Docker Compose** numa máquina local, que é o servidor: app Next.js (build `standalone`), MySQL 8, proxy reverso **Caddy** com HTTPS (RNF06), backup diário (RNF11), painel de disponibilidade Uptime Kuma (RNF01) e, opcionalmente, o túnel do webhook do Mercado Pago. Outros dispositivos acessam pela rede local, por IP ou hostname da máquina. Detalhes na seção 5.1 |

Integrações, todas em sandbox ou homologação: Mercado Pago (Checkout Transparente/Bricks), ViaCEP, Correios, agregador de transportadoras, BrasilAPI (CNPJ) e emissor de NF-e.

## 2. Organização de código

```
app/                    → só rotas; cada page.tsx renderiza a View da feature
app/api/webhooks/*      → Route Handlers só para webhooks externos (Mercado Pago)
app/api/csp-report      → só grava no log as violações de CSP da página de pagamento (#173)
app/api/health          → healthcheck do container (SELECT 1 no MySQL, RNF01)
app/media/[...key]      → arquivos do storage: imagens públicas; PDF de produto inativo só com `product:read`
app/admin/nfe/[id]/[arquivo]       → XML ou DANFE da NF-e, só com `invoice:manage` (senão 404)
app/admin/produtos/importar/modelo → modelo CSV da importação, só com `product:create`
components/             → UI genérica e layout; components/ui (shadcn)
features/<dominio>/<feature>/
  <feature>-view.tsx    → "use client": só apresentação e estado de UI
  action/               → "use server": única camada de lógica e regra de negócio
  schema/               → schemas Zod + tipos derivados (um arquivo coeso por feature)
features/shared/        → código usado por mais de uma feature
lib/utils.ts            → helper `cn` das classes Tailwind (shadcn/ui); hooks ficam na feature ou em `features/shared/lib/`
emails/                 → templates de e-mail transacional (RF53)
prisma/schema.prisma    → modelo de dados (fonte única do schema MySQL)
prisma/migrations/      → migrations SQL versionadas, geradas pelo Prisma (uma por mudança coesa)
prisma/seed.ts          → seed de configuração (valores das RN) e dados de desenvolvimento
features/shared/lib/db/ → client Prisma único (server-only) e camada de acesso a dados com permissão
docker-compose.yml      → servidor local: proxy (Caddy), app, db (MySQL 8), backup, uptime-kuma e, no perfil `tunnel`, webhook-gate e tunnel
Dockerfile              → imagem do app (Next.js standalone)
deploy/                 → Caddyfile, scripts de backup/restauração e config do MySQL
tests/                  → testes Vitest e Playwright
```

Domínios previstos, um por label `área: *`: `catalog`, `access`, `shipping`, `cart` (carrinho e cotação), `payment`, `finance`, `orders`, `after-sales`, `backoffice` e `app`.

### Regras

- **Nunca importe de dentro de outra feature.** Código reutilizado vai antes para `features/shared/`.
- Schema Zod **nunca inline** em view ou action: fica sempre em `schema/`. O mesmo schema valida o client (`zodResolver`) e a Server Action.
- `components/` só tem apresentação pura. Componente com dado ou lógica de feature fica na feature.
- Exceção: as Server Actions usadas por várias features ficam em `features/shared/lib/` (`cart/cart-actions.ts`, `favorites/favorite-actions.ts`, `shipping/shipping-actions.ts` e `viacep/cep-actions.ts`), com as mesmas regras da seção 3.

### Mapeamento MVC (RNF07)

| MVC | Onde |
|---|---|
| Model | Tabelas MySQL modeladas em `prisma/schema.prisma` + `schema/` (Zod e tipos) |
| View | `*-view.tsx` e componentes da feature |
| Controller | `action/*.ts` (Server Actions); Route Handlers só para webhooks (`app/api/webhooks/*`), healthcheck, relatório de CSP e downloads de arquivo (lista acima) |

## 3. Regra de ouro: lógica só em Server Action

- Regra de negócio, acesso ao banco, validação sensível e mutação ficam em `action/*.ts`. A action recebe o input, **revalida com Zod**, checa a permissão, acessa o banco pelo Prisma e retorna `{ success: true, ... } | { success: false; error: "..." }`, em vez de lançar exceção.
- Views `"use client"` nunca acessam o banco nem decidem o que é permitido. O status do pagamento "em tempo real" (RF31) é atualizado por polling curto (`setInterval` de 5 s em `features/payment/order-payment/order-payment-view.tsx`), que lê uma action e para quando o status é final.
- Operações que mexem em mais de uma tabela (pedido + reserva de estoque, aprovação, estorno) rodam numa **transação** (`prisma.$transaction`). A reserva de estoque usa `SELECT ... FOR UPDATE`, para que dois pedidos simultâneos não reservem a mesma unidade (#64).
- Erros nunca expõem stack trace nem detalhe interno (RNF05).
- **Integração de saída** (Mercado Pago, Correios, transportadora, NF-e, BrasilAPI, ViaCEP) fica em `features/shared/lib/<integracao>/`. É `server-only`, só roda depois da checagem de permissão, tem chave em env sem `NEXT_PUBLIC_`, timeout e fallback (RN20, RN21), e o log sai sem headers, payload ou dados de cartão.
- **Webhook do Mercado Pago** (Route Handler): valida a assinatura, processa de forma idempotente e confirma o pedido só com `approved` (RN13).

## 4. Permissões (RBAC)

- O MySQL não tem segurança por linha (RLS). A autorização fica **no servidor, numa camada única**:
  1. A Server Action obtém o usuário da sessão (Better Auth) e chama `requirePermission("<resource>:<action>")` antes de operar.
  2. As consultas passam pela camada de acesso a dados (`features/shared/lib/db/`), que **sempre** aplica o escopo do usuário: a conta corporativa dele, os pedidos dele etc. O id do usuário vem da sessão, nunca do request.
- O usuário de banco da aplicação tem só `SELECT`, `INSERT`, `UPDATE` e `DELETE` no schema dela, sem DDL. As migrations rodam com outro usuário, só no deploy.
- Tabelas de RBAC dos perfis internos: `roles`, `permissions` (`resource` + `action` únicos), `role_permissions` e `user_roles`. Permissão interna nova nasce numa migration ou no seed.
- Permissões no formato `"<resource>[:<sub>]:<action>"`, em inglês.
- Esconder botão ou menu é só UX: a checagem que vale é a da action.
- As flags de permissão da UI são calculadas uma vez no `page.tsx` e descem por prop.
- Dois conjuntos de perfis:
  - Internos (RF55): administrador, comercial, financeiro e estoque/logística.
  - Da conta corporativa (RF10, RN08): solicitante, aprovador, financeiro e administrador da conta. Esses perfis e as permissões deles são estáticos, definidos no código (`features/shared/lib/auth/corporate-roles.ts`), e ficam gravados como texto em `members.role`; não usam as tabelas de RBAC.
- 2FA obrigatório (#177): o usuário interno com acesso a pedidos, pagamentos ou estornos (`TWO_FACTOR_REQUIRED_PERMISSIONS`, `features/shared/lib/auth/permissions.ts`) só usa o back office com o 2FA ativo e verificado na sessão atual (`assertTwoFactor`, `features/shared/lib/db/permissions.ts`).
- Exclusão feita pelo usuário é **soft delete** (`deleted_at`), para não quebrar pedidos e notas antigos (RF42, LGPD). Ações sensíveis gravam log de auditoria (RNF12) na mesma transação da mudança.

## 5. Banco de dados (MySQL) e migrations

- **MySQL 8**, engine InnoDB, charset `utf8mb4` e collation `utf8mb4_0900_ai_ci`, para a busca ignorar acentos e caixa (#25). Datas são gravadas em UTC (`DATETIME(3)`) e exibidas no fuso do usuário.
- **Prisma é o único caminho até o banco.** `prisma/schema.prisma` é a fonte da verdade. Nomes de tabela e coluna em inglês e `snake_case` (`@@map`/`@map`), e no código em `camelCase`.
- **Dinheiro** é `DECIMAL(12,2)`, nunca `FLOAT`. Peso e dimensões usam `DECIMAL` com a unidade no nome da coluna (`weight_kg`, `length_cm`).
- **Chaves:** `id` em UUID v7 (`CHAR(36)`) nas entidades expostas em URL (pedido, cotação), para não deixar a sequência visível. Códigos legíveis, como o número da cotação (RF06), ficam numa coluna própria, com `UNIQUE`.
- **Integridade:** FKs explícitas, `UNIQUE` em documentos (CPF, CNPJ, e-mail, SKU, `payment_id`) e índices nas colunas de filtro e busca: categoria, status, preço e um `FULLTEXT` em nome e descrição.
- **Gatilhos:** 20 gatilhos, criados por migration, são a última linha de defesa. Eles tornam imutáveis a auditoria, o histórico de status, o razão de estoque e a NF-e emitida, e recusam estoque negativo, estorno maior que o pago e desconto fora de 0 a 100%. Eles só recusam, nunca gravam dados. Para o `atelier_migrate` criá-los com o binlog ligado, o MySQL roda com `log_bin_trust_function_creators=1`.
- **Documentação do modelo:** escopo, DER, MER, dicionário de dados, gatilhos e script SQL em [`docs/banco-de-dados/`](docs/banco-de-dados/README.md). Os diagramas, o dicionário e o script são gerados do banco migrado por `npm run db:docs`, e entram no mesmo PR da migration.
- **Banco sombra:** o `prisma migrate dev` recria as migrations num banco sombra. No MySQL do Docker, o usuário de migração não pode criar bancos, então o script de inicialização cria o `atelier_bureau_shadow` e o `SHADOW_DATABASE_URL` aponta para ele. Num volume criado antes dessa mudança, crie o banco e o `GRANT` à mão como `root`, dentro do container (comandos em `deploy/mysql/init/01-users.sh`).
- **Migrations:** `npx prisma migrate dev` em dev, `npx prisma migrate deploy` no deploy, e uma por mudança coesa, versionada no PR. Nunca se altera o banco à mão em homologação ou produção. Seguem expand/contract: adiciona antes e remove só depois que a release que parou de usar o objeto chegou à `master`.
- **Seed** (`prisma/seed.ts`): valores das regras de negócio confirmados na #5 (tabela de configuração), perfis e permissões, e dados fictícios de desenvolvimento (#8).
- **Segurança (RNF03):** o MySQL exige TLS (`--require-secure-transport=ON` no `docker-compose.yml`) em toda conexão TCP, e os usuários `atelier_app`, `atelier_migrate`, `atelier_backup` e `dev` são `REQUIRE SSL` (#221). O Prisma CLI só negocia TLS com `?sslaccept=accept_invalid_certs` na URL de migração; num banco criado antes da #221, aplique `sh deploy/mysql/require-tls.sh`. Dados sensíveis (documento e telefone) são criptografados na aplicação antes de gravar, com AES-256-GCM e a chave `DATA_ENCRYPTION_KEY` (`features/shared/lib/crypto/personal-data-cipher.ts`). Senha só como hash (Better Auth), e dado de cartão nunca chega ao banco (RN19).
- **Backup (RNF11):** um container de backup roda `mysqldump` uma vez por dia, com retenção de 30 dias em `./backups`. A restauração usa `deploy/backup/restore.sh` (ou `restore.ps1` no Windows), que confere o dump, pede confirmação, faz um dump de segurança e recria o banco. Passo a passo, RTO de 4 h e roteiro de teste em [`docs/AtelierBureau_Backup_Restauracao.md`](docs/AtelierBureau_Backup_Restauracao.md) (#81).
- **Configuração:** `DATABASE_URL` e as demais chaves vêm do `.env` (não versionado), e o `.env.example` traz o modelo.

### 5.1 Servidor local (Docker) e acesso pela rede

A máquina com o projeto é o servidor. Um único `docker compose up -d` sobe tudo, e os outros dispositivos da mesma rede (notebooks, celulares) acessam por ela.

| Serviço | Imagem | Porta publicada na rede | Papel |
|---|---|---|---|
| `proxy` | `caddy:2` | **80, 443 e 3001** | HTTPS na frente do app (o 80 só redireciona para o 443, RNF06) e do painel de disponibilidade na 3001 |
| `app` | build do `Dockerfile` | nenhuma (só na rede interna) | Next.js em cluster de workers (`APP_WORKERS`, padrão 4). Roda `prisma migrate deploy` ao iniciar |
| `db` | `mysql:8.4` | **3306**, só em `127.0.0.1` por padrão | MySQL com volume persistente `mysql-data` |
| `backup` | `mysql:8.4` | nenhuma | `mysqldump` diário em `./backups` (30 dias), por um laço de `deploy/backup/backup.sh --daemon` no horário `BACKUP_HOUR` (UTC) |
| `uptime-kuma` | `louislam/uptime-kuma:1` | nenhuma (só pelo `proxy`, na 3001) | Painel de disponibilidade e alertas por e-mail (#80) |
| `webhook-gate` | `caddy:2` | nenhuma (8080 só na rede `tunnel`) | Perfil opcional `tunnel`: repassa ao app só `POST /api/webhooks/mercadopago` (`deploy/caddy/Caddyfile.webhook`, #57) |
| `tunnel` | `cloudflare/cloudflared` | nenhuma (conexão de saída para a Cloudflare) | Perfil opcional `tunnel`: expõe o `webhook-gate` na internet com `CLOUDFLARE_TUNNEL_TOKEN`; isolado na rede `tunnel`, só alcança o gate |

- **Endereço:** reserve um IP fixo para a máquina no roteador (ex.: `192.168.0.50`). O site fica em `https://<ip-ou-hostname>`, e o banco em `<ip>:3306`.
- **Firewall do Windows:** libere 80, 443 e 3001 (e 3306, se o banco for aberto à rede) **só no perfil de rede Privada**, nunca em rede Pública.
- **HTTPS na rede local:** o Caddy usa `tls internal` e gera uma autoridade certificadora local. Instale o certificado raiz dela (exportado em `deploy/certs/root.crt` por `deploy/export-root-cert.sh` ou, no Windows, `deploy/export-root-cert.ps1`) em cada dispositivo para o navegador não mostrar aviso.
- **Sem fallback para HTTP (RNF06):** a porta 80 só responde com redirecionamento `308` para o HTTPS, qualquer que seja o host. Um host sem certificado é recusado no handshake TLS da 443. O HSTS e os demais headers de segurança saem do Caddy, e a CSP sai do próprio app (`features/shared/lib/security/headers.ts`): estática no `next.config.ts` para as páginas comuns e com nonce por requisição, gerada no `proxy.ts`, na página de pagamento (#173). O baseline aprovado dessa página fica em `deploy/payment-page-baseline.json` e é conferido por `npm run security:payment-page -- https://<ip-do-servidor>`. Para conferir de outro dispositivo: `sh deploy/check-headers.sh <ip-do-servidor>`, que sai com erro se faltar algum header crítico.
- **Acesso ao MySQL por outros dispositivos:**
  - Só com usuários nomeados e senha forte, com host restrito à sub-rede (`'dev'@'192.168.0.%'`) e TLS obrigatório.
  - O `root` não tem acesso remoto.
  - O app usa um usuário próprio sem DDL. As migrations rodam com o usuário de migração.
  - A porta 3306 é publicada só em `127.0.0.1` por padrão. No Docker Desktop, toda conexão que entra pela porta publicada chega ao MySQL com o IP do gateway do Docker, então o MySQL não consegue separar quem vem da LAN. Por isso, abrir o banco à rede é uma decisão explícita: `MYSQL_PUBLISH_ADDR=0.0.0.0` no `.env`, com o firewall no perfil Privado e senhas fortes em todos os usuários.
  - As configurações do servidor (charset, fuso UTC, TLS e conexões) vão como flags do `mysqld` no `docker-compose.yml`. Um `.cnf` montado do Windows chega com permissão de escrita para todos, e o MySQL o ignora.
  - A conexão do app com o MySQL é criptografada por padrão (`DATABASE_TLS=required`, em `features/shared/lib/db/connection-config.ts`). O certificado do container é autoassinado, então o padrão não confere a cadeia; `DATABASE_TLS=verify` com `DATABASE_TLS_CA` apontando para o `ca.pem` do volume confere. Só com `DATABASE_TLS=disabled` (MySQL local sem TLS) o driver busca a chave pública RSA do servidor (`allowPublicKeyRetrieval`), exigida pelo `caching_sha2_password`.
- **Webhook do Mercado Pago:** o Mercado Pago precisa alcançar o servidor pela internet. Um túnel (`cloudflared`, perfil opcional `tunnel`) expõe **só** a rota `/api/webhooks/mercadopago` (#57):
  - `docker compose --profile tunnel up -d` sobe o `tunnel` e o `webhook-gate`. O túnel fica sozinho com o gate na rede `tunnel` e não alcança o app, o proxy nem o banco.
  - O gate (`deploy/caddy/Caddyfile.webhook`, porta 8080 não publicada) repassa ao app só `POST /api/webhooks/mercadopago`. Qualquer outro método ou caminho recebe 404.
  - No painel da Cloudflare, o hostname público do túnel aponta para `http://webhook-gate:8080`. A URL pública completa vai em `MERCADOPAGO_NOTIFICATION_URL` (ou no painel de webhooks do Mercado Pago), e a chave secreta do webhook vai em `MERCADOPAGO_WEBHOOK_SECRET`.
  - **Trava de sandbox (#7):** credenciais do Mercado Pago que não começam com `TEST-` são recusadas (o pagamento online fica indisponível e o log diz o motivo, sem o valor), a menos que `MERCADOPAGO_ALLOW_PRODUCTION=true`. Em dev, homologação e no servidor de entrega, fica `false`.
  - A rota valida a assinatura `x-signature`, é idempotente pelo `x-request-id` (tabela `payment_notifications`), relê o pagamento em `GET /v1/payments/{id}` e só confirma o pedido com `approved` (RN13).
  - Se o webhook não chegar, a reconciliação (job a cada 5 minutos e antes de expirar Pix e boleto) consulta `GET /v1/payments/{id}`, ou busca pelo `external_reference` quando a criação ficou sem resposta.
- **Cluster de workers (RNF02, #79):** a renderização das páginas usa CPU, e um processo Node.js usa um núcleo só. O container do app roda `deploy/app/cluster.mjs`, que sobe `APP_WORKERS` processos (padrão 4, nunca mais que as CPUs) na mesma porta 3000. O primeiro worker é o **coordenador**: só ele roda os jobs (RN14, RF53) e a criptografia de dados legados (RNF03), e guarda os contadores do rate limit, que os outros workers consultam por IPC (`features/shared/lib/rate-limit/shared-limit.ts`). O cache `"use cache"` continua em memória em cada worker, e o handler `deploy/app/cache-handler.mjs` repassa a invalidação de tags do back office aos demais workers. Worker que cai é reiniciado com o mesmo papel. Memória: cada worker tem o próprio heap do Node.js e até 50 MB de `"use cache"`; com 4 workers o container fica perto de 1 GB, e o compose não define limite de memória. O worker que recebe a invalidação a aplica também no manifest de tags do cache incremental (ISR), que é um mapa em memória por processo, como faria um `revalidateTag` local; mesmo assim, preço, estoque e textos editáveis ficam atrás de `connection()` e nunca entram nos shells estáticos.
- **Disponibilidade (RNF01):** todos os containers têm `restart: unless-stopped` e healthcheck. O `GET /api/health` roda `SELECT 1` no MySQL e responde 503 sem detalhe se o banco cair. O Uptime Kuma (`https://<ip>:3001`, só para endereços da rede local) guarda o histórico de disponibilidade e manda e-mail em queda. Monitores, alerta e roteiro de teste em [`docs/AtelierBureau_Monitoramento.md`](docs/AtelierBureau_Monitoramento.md) (#80).
- **Dados fictícios:** o servidor roda em sandbox/homologação. Não há dados reais de clientes nem de pagamento.

## 6. Convenções de código

- Código e banco (tabela, coluna, função, variável, permissão) em **inglês**. Tudo o que o usuário vê fica em **português**.
- Prettier: sem ponto e vírgula, aspas duplas, 2 espaços, `printWidth: 80`, `trailingComma: es5`, `endOfLine: lf`.
- Arquivos e pastas em `kebab-case`, componentes em `PascalCase`, hooks, funções e variáveis em `camelCase`. A view principal de cada feature se chama `<Feature>View`.
- Antes de concluir: `npx prettier --write <arquivos>`, `npm run lint`, `npm run typecheck` e `npm test`.
- Env: `.env.example` é a única fonte das chaves, com a origem de cada uma e sem valores reais. `.env.local` não é versionado.

## 7. Git, issues e release

### Branches
- `master`: produção. Só recebe PR de release (`develop → master`, com bump de versão) ou `patch/*`.
- `develop`: próxima versão em construção, sempre publicável.
- Trabalho em branch curta a partir da `develop`, no formato `<type>/<issue>-<slug>` (ex.: `feat/24-plp-filters`). O PR para a `develop` só entra com a issue completa.
- Todo merge usa **"Create a merge commit"** (nada de squash ou rebase).

### Commits
- [Conventional Commits](https://www.conventionalcommits.org/) em inglês: `feat`, `fix`, `refactor`, `perf`, `chore`, `docs` e `test`.
- O rodapé leva `Closes #N` quando o commit resolve a issue e `Refs #N` quando é trabalho parcial. A issue fecha quando a release chega na `master` (fechada = em produção).
- Título e descrição do PR em inglês, com `Closes #N` na descrição.

### Issues
- Cada issue tem **um** label `tipo: *` (feature, task, bug ou refactor), **um** `área: *` e os labels de preocupação que couberem: `segurança`, `banco`, `performance`, `infra`, `observabilidade`, `testes`, `documentação`, `escopo a validar` e `accessibility`.
- O type fica no label `tipo: *`, porque o repositório é pessoal e não tem issue types do GitHub.
- Não há épicos nem sub-issues: cada issue é escrita de forma independente.
- **Prioridade (P0/P1/P2), esforço, etapa e status** são campos do GitHub Project "Atelier Bureau", não labels. O Status espelha as listas do Trello: Backlog, Bloqueado, Em andamento, Em revisão, Em teste, Em validação e Concluído.
- Uma issue resolvida sem commit (por exemplo, uma decisão) é fechada à mão, com comentário.

### Milestones e versões
- Milestone = versão SemVer em que o escopo sai, com um dia de prazo cada. A entrega final, com o projeto rodando, é em **14/11/2026**:

| Milestone | Escopo | Entrega |
|---|---|---|
| v0.1.0 | Dia 1: Etapa 0 (Planejamento e Decisões) + Etapa 1 (Fundação Técnica e Design System) | 10/11/2026 |
| v0.2.0 | Dia 2: Etapa 2 — Catálogo e Conta | 11/11/2026 |
| v0.3.0 | Dia 3: Etapa 3 — Carrinho, Frete e Checkout | 12/11/2026 |
| v0.4.0 | Dia 4: Etapa 4 (Fluxo B2B) + Etapa 5 (Pós-venda e Back Office) | 13/11/2026 |
| v1.0.0 | Dia 5: Etapa 6 — Qualidade, Segurança e Lançamento | 14/11/2026 |

- Todos os milestones ficam abertos e com data, porque o cronograma é fixo. Cada um é fechado quando a release dele chega à `master`.
- Release: PR `develop → master` com notas de release e bump da `version` no `package.json`, como último commit (`chore(release): bump version to X.Y.Z`).
