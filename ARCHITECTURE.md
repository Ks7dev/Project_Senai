# Arquitetura — Atelier Bureau

Padrão técnico do projeto (issue #1, RNF07): stack, organização de código, regras de implementação e fluxo de trabalho. Toda contribuição segue este documento.

## 1. Stack

| Camada | Escolha |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + **TypeScript** `strict` |
| UI | **Tailwind CSS v4** (config em `app/globals.css`, sem `tailwind.config.js`), **shadcn/ui** (style `base-nova`, primitivas `@base-ui/react`), ícones **`lucide-react`** (decisão da #3), `framer-motion`, `next-themes` |
| Formulários | `react-hook-form` + `zod` + `@hookform/resolvers/zod` |
| Banco de dados (RNF16) | **MySQL 8** (InnoDB, `utf8mb4`), acessado só pelo **Prisma ORM**, que cuida do schema, das migrations e dos seeds |
| Autenticação | **Better Auth** com adapter Prisma: sessão em cookie `httpOnly`, recuperação de senha, plugin de 2FA (RF40) e plugin de organizações para contas corporativas multiusuário (RF09, RF10) |
| Arquivos | Imagens, fichas técnicas em PDF e anexos num armazenamento S3-compatível (disco local em dev). O banco guarda só a chave e os metadados do arquivo |
| Listagens | `@tanstack/react-table` v9 + `@tanstack/react-query` v5 |
| Imagens | `sharp` no servidor: valida, converte para WebP com até 300 KB e gera versões responsivas (RNF04) |
| Qualidade | ESLint (`eslint-config-next`) + Prettier (`prettier-plugin-tailwindcss`) + `tsc --noEmit` |
| Testes (RNF07) | **Vitest**: unitários de schema, action e regras de negócio. **Playwright**: ponta a ponta do fluxo de compra |
| Documentação de código (RNF08) | **JSDoc** em toda função exportada, cobrado por `eslint-plugin-jsdoc` |
| Servidor | **Docker Compose** numa máquina local, que é o servidor: app Next.js (build `standalone`), MySQL 8, proxy reverso **Caddy** com HTTPS (RNF06) e backup diário (RNF11). Outros dispositivos acessam pela rede local, por IP ou hostname da máquina. Detalhes na seção 5.1 |

Integrações, todas em sandbox ou homologação: Mercado Pago (Checkout Transparente/Bricks), ViaCEP, Correios, agregador de transportadoras, BrasilAPI (CNPJ) e emissor de NF-e.

## 2. Organização de código

```
app/                    → só rotas; cada page.tsx renderiza a View da feature
app/api/webhooks/*      → Route Handlers só para webhooks externos (Mercado Pago)
components/             → UI genérica e layout; components/ui (shadcn)
features/<dominio>/<feature>/
  <feature>-view.tsx    → "use client": só apresentação e estado de UI
  action/               → "use server": única camada de lógica e regra de negócio
  schema/               → schemas Zod + tipos derivados (um arquivo coeso por feature)
features/shared/        → código usado por mais de uma feature
lib/, hooks/            → utilitários e hooks genéricos
emails/                 → templates de e-mail transacional (RF53)
prisma/schema.prisma    → modelo de dados (fonte única do schema MySQL)
prisma/migrations/      → migrations SQL versionadas, geradas pelo Prisma (uma por mudança coesa)
prisma/seed.ts          → seed de configuração (valores das RN) e dados de desenvolvimento
features/shared/lib/db/ → client Prisma único (server-only) e camada de acesso a dados com permissão
docker-compose.yml      → servidor local: app, MySQL 8, Caddy e backup
Dockerfile              → imagem do app (Next.js standalone)
deploy/                 → Caddyfile, scripts de backup/restauração e config do MySQL
tests/                  → testes Vitest e Playwright
```

Domínios previstos, um por label `área: *`: `catalog`, `access`, `shipping`, `cart` (carrinho e cotação), `payment`, `finance`, `orders`, `after-sales`, `backoffice` e `app`.

### Regras

- **Nunca importe de dentro de outra feature.** Código reutilizado vai antes para `features/shared/`.
- Schema Zod **nunca inline** em view ou action: fica sempre em `schema/`. O mesmo schema valida o client (`zodResolver`) e a Server Action.
- `components/` só tem apresentação pura. Componente com dado ou lógica de feature fica na feature.

### Mapeamento MVC (RNF07)

| MVC | Onde |
|---|---|
| Model | Tabelas MySQL modeladas em `prisma/schema.prisma` + `schema/` (Zod e tipos) |
| View | `*-view.tsx` e componentes da feature |
| Controller | `action/*.ts` (Server Actions) e, só para webhooks, `app/api/webhooks/*` |

## 3. Regra de ouro: lógica só em Server Action

- Regra de negócio, acesso ao banco, validação sensível e mutação ficam em `action/*.ts`. A action recebe o input, **revalida com Zod**, checa a permissão, acessa o banco pelo Prisma e retorna `{ success: true, ... } | { success: false; error: "..." }`, em vez de lançar exceção.
- Views `"use client"` nunca acessam o banco nem decidem o que é permitido. O status do pagamento "em tempo real" (RF31) é atualizado por polling curto (`refetchInterval` do React Query), que lê uma action e para quando o status é final.
- Operações que mexem em mais de uma tabela (pedido + reserva de estoque, aprovação, estorno) rodam numa **transação** (`prisma.$transaction`). A reserva de estoque usa `SELECT ... FOR UPDATE`, para que dois pedidos simultâneos não reservem a mesma unidade (#64).
- Erros nunca expõem stack trace nem detalhe interno (RNF05).
- **Integração de saída** (Mercado Pago, Correios, transportadora, NF-e, BrasilAPI, ViaCEP) fica em `features/shared/lib/<integracao>/`. É `server-only`, só roda depois da checagem de permissão, tem chave em env sem `NEXT_PUBLIC_`, timeout e fallback (RN20, RN21), e o log sai sem headers, payload ou dados de cartão.
- **Webhook do Mercado Pago** (Route Handler): valida a assinatura, processa de forma idempotente e confirma o pedido só com `approved` (RN13).

## 4. Permissões (RBAC)

- O MySQL não tem segurança por linha (RLS). A autorização fica **no servidor, numa camada única**:
  1. A Server Action obtém o usuário da sessão (Better Auth) e chama `requirePermission("<resource>:<action>")` antes de operar.
  2. As consultas passam pela camada de acesso a dados (`features/shared/lib/db/`), que **sempre** aplica o escopo do usuário: a conta corporativa dele, os pedidos dele etc. O id do usuário vem da sessão, nunca do request.
- O usuário de banco da aplicação tem só `SELECT`, `INSERT`, `UPDATE` e `DELETE` no schema dela, sem DDL. As migrations rodam com outro usuário, só no deploy.
- Tabelas de RBAC: `roles`, `permissions` (`resource` + `action` únicos), `role_permissions` e `user_roles`. Permissão nova nasce numa migration ou no seed.
- Permissões no formato `"<resource>[:<sub>]:<action>"`, em inglês.
- Esconder botão ou menu é só UX: a checagem que vale é a da action.
- As flags de permissão da UI são calculadas uma vez no `page.tsx` e descem por prop.
- Dois conjuntos de perfis:
  - Internos (RF55): administrador, comercial, financeiro e estoque/logística.
  - Da conta corporativa (RF10, RN08): solicitante, aprovador, financeiro e administrador da conta.
- Exclusão feita pelo usuário é **soft delete** (`deleted_at`), para não quebrar pedidos e notas antigos (RF42, LGPD). Ações sensíveis gravam log de auditoria (RNF12) na mesma transação da mudança.

## 5. Banco de dados (MySQL) e migrations

- **MySQL 8**, engine InnoDB, charset `utf8mb4` e collation `utf8mb4_0900_ai_ci`, para a busca ignorar acentos e caixa (#25). Datas são gravadas em UTC (`DATETIME(3)`) e exibidas no fuso do usuário.
- **Prisma é o único caminho até o banco.** `prisma/schema.prisma` é a fonte da verdade. Nomes de tabela e coluna em inglês e `snake_case` (`@@map`/`@map`), e no código em `camelCase`.
- **Dinheiro** é `DECIMAL(12,2)`, nunca `FLOAT`. Peso e dimensões usam `DECIMAL` com a unidade no nome da coluna (`weight_kg`, `length_cm`).
- **Chaves:** `id` em UUID v7 (`CHAR(36)`) nas entidades expostas em URL (pedido, cotação), para não deixar a sequência visível. Códigos legíveis, como o número da cotação (RF06), ficam numa coluna própria, com `UNIQUE`.
- **Integridade:** FKs explícitas, `UNIQUE` em documentos (CPF, CNPJ, e-mail, SKU, `payment_id`) e índices nas colunas de filtro e busca: categoria, status, preço e um `FULLTEXT` em nome e descrição.
- **Migrations:** `npx prisma migrate dev` em dev, `npx prisma migrate deploy` no deploy, e uma por mudança coesa, versionada no PR. Nunca se altera o banco à mão em homologação ou produção. Seguem expand/contract: adiciona antes e remove só depois que a release que parou de usar o objeto chegou à `master`.
- **Seed** (`prisma/seed.ts`): valores das regras de negócio confirmados na #5 (tabela de configuração), perfis e permissões, e dados fictícios de desenvolvimento (#8).
- **Segurança (RNF03):** o MySQL exige TLS (`require_secure_transport=ON`) em conexões vindas da rede. Dados sensíveis (documento e telefone) são criptografados na aplicação antes de gravar. Senha só como hash (Better Auth), e dado de cartão nunca chega ao banco (RN19).
- **Backup (RNF11):** um container de backup roda `mysqldump` uma vez por dia, com retenção de 30 dias em `./backups`, e a restauração é testada e documentada (#81).
- **Configuração:** `DATABASE_URL` e as demais chaves vêm do `.env` (não versionado), e o `.env.example` traz o modelo.

### 5.1 Servidor local (Docker) e acesso pela rede

A máquina com o projeto é o servidor. Um único `docker compose up -d` sobe tudo, e os outros dispositivos da mesma rede (notebooks, celulares) acessam por ela.

| Serviço | Imagem | Porta publicada na rede | Papel |
|---|---|---|---|
| `proxy` | `caddy:2` | **80 e 443** | HTTPS na frente do app. O 80 só redireciona para o 443 (RNF06) |
| `app` | build do `Dockerfile` | nenhuma (só na rede interna) | Next.js. Roda `prisma migrate deploy` ao iniciar |
| `db` | `mysql:8.4` | **3306**, só em `127.0.0.1` por padrão | MySQL com volume persistente `mysql-data` |
| `backup` | `mysql:8.4` + cron | nenhuma | `mysqldump` diário em `./backups` (30 dias) |

- **Endereço:** reserve um IP fixo para a máquina no roteador (ex.: `192.168.0.50`). O site fica em `https://<ip-ou-hostname>`, e o banco em `<ip>:3306`.
- **Firewall do Windows:** libere 80 e 443 (e 3306, se o banco for aberto à rede) **só no perfil de rede Privada**, nunca em rede Pública.
- **HTTPS na rede local:** o Caddy usa `tls internal` e gera uma autoridade certificadora local. Instale o certificado raiz dela (exportado em `deploy/certs/root.crt` por `deploy/export-root-cert.sh` ou, no Windows, `deploy/export-root-cert.ps1`) em cada dispositivo para o navegador não mostrar aviso.
- **Sem fallback para HTTP (RNF06):** a porta 80 só responde com redirecionamento `308` para o HTTPS, qualquer que seja o host. Um host sem certificado é recusado no handshake TLS da 443. O HSTS e os demais headers de segurança saem do Caddy, e a CSP sai do próprio app (`features/shared/lib/security/headers.ts`). Para conferir de outro dispositivo: `sh deploy/check-headers.sh <ip-do-servidor>`, que sai com erro se faltar algum header crítico.
- **Acesso ao MySQL por outros dispositivos:**
  - Só com usuários nomeados e senha forte, com host restrito à sub-rede (`'dev'@'192.168.0.%'`) e TLS obrigatório.
  - O `root` não tem acesso remoto.
  - O app usa um usuário próprio sem DDL. As migrations rodam com o usuário de migração.
  - A porta 3306 é publicada só em `127.0.0.1` por padrão. No Docker Desktop, toda conexão que entra pela porta publicada chega ao MySQL com o IP do gateway do Docker, então o MySQL não consegue separar quem vem da LAN. Por isso, abrir o banco à rede é uma decisão explícita: `MYSQL_PUBLISH_ADDR=0.0.0.0` no `.env`, com o firewall no perfil Privado e senhas fortes em todos os usuários.
  - As configurações do servidor (charset, fuso UTC, TLS e conexões) vão como flags do `mysqld` no `docker-compose.yml`. Um `.cnf` montado do Windows chega com permissão de escrita para todos, e o MySQL o ignora.
  - O MySQL 8 autentica com `caching_sha2_password`. Sem TLS, o driver do app busca a chave pública RSA do servidor (`allowPublicKeyRetrieval`, em `features/shared/lib/db/connection-config.ts`).
- **Webhook do Mercado Pago:** o Mercado Pago precisa alcançar o servidor pela internet. Um túnel (`cloudflared`, serviço opcional `tunnel`) expõe **só** a rota `/api/webhooks/mercadopago`. Se o webhook não chegar, uma reconciliação consulta `GET /v1/payments/{id}` (#57).
- **Disponibilidade (RNF01):** todos os containers têm `restart: unless-stopped` e healthcheck. O app depende de a máquina servidora estar ligada e na rede, e o monitoramento fica na #80.
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
