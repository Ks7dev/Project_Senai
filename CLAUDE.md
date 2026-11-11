# CLAUDE.md — Atelier Bureau

E-commerce high ticket de papelaria nobre e mobiliário executivo, híbrido B2B + B2C (projeto acadêmico SENAI). Este arquivo reúne as **políticas de desenvolvimento** obrigatórias. O detalhe técnico está em `ARCHITECTURE.md`. Estas regras se sobrepõem a padrões genéricos de Next.js, React e Prisma.

## 1. Mapa de contexto

| Assunto | Arquivo |
|---|---|
| Requisitos (RF, RN, RNF, personas, matriz RN x RF) | `docs/AtelierBureau_Levantamento_Requisitos_v2.docx` |
| Stack, organização de código, banco, servidor local, Git e release | `ARCHITECTURE.md` |
| Backlog: as 82 issues com labels, milestone, prioridade e critérios | `docs/AtelierBureau_Issues.md` |
| Quadro do Trello: listas, prazos e cards | `docs/AtelierBureau_Trello_Etapas.md` |
| Acompanhamento (status, prioridade, esforço e etapa) | GitHub Project "Atelier Bureau" (`github.com/users/Ks7dev/projects/1`) |

Antes de implementar uma issue, leia os requisitos que ela referencia (RF, RN ou RNF) e os critérios de aceite. **O requisito manda**: se o código e o requisito divergirem, pare e pergunte.

## 2. Prazo e escopo

- Entrega final **em 14/11/2026, com o projeto rodando** no servidor local. Um milestone por dia: v0.1.0 (10/11), v0.2.0 (11/11), v0.3.0 (12/11), v0.4.0 (13/11) e v1.0.0 (14/11).
- A ordem de trabalho é: milestone do dia, depois prioridade (P0 → P1 → P2), depois dependência (#1 → #6 → #7 → #8 → resto).
- Se o dia apertar, P2 e P1 saem do milestone antes de P0, e a decisão é registrada na issue. Nunca entra código pela metade.

## 3. Idioma

- Código, banco (tabelas, colunas), permissões, commits, títulos e descrições de PR: **inglês**.
- Tudo o que o usuário vê (labels, mensagens, e-mails, páginas), as issues e os docs: **português (Brasil)**, com acentuação correta.

## 4. Stack (não troque sem decisão registrada)

- **Next.js 16** (App Router) + **React 19** + **TypeScript** `strict`.
- **UI:** Tailwind CSS v4, shadcn/ui (`base-nova`, `@base-ui/react`) e ícones **`lucide-react`**. Não use outra biblioteca de ícones. Os tokens do design system "Warm Editorial Atelier" (RNF15) são a fonte única de cores, tipografia e espaçamento.
- **Banco: MySQL 8 via Prisma** (RNF16). Não use Supabase, PostgreSQL nem SQL fora do Prisma, exceto em `$queryRaw` justificado.
- **Autenticação:** Better Auth (adapter Prisma, 2FA e organizações).
- **Formulários:** `react-hook-form` + `zod`.
- **Imagens:** `sharp` no servidor.
- **Testes:** Vitest + Playwright.
- Dependência nova só quando nada da stack resolve, e com a justificativa no PR.

## 5. Organização de código

```
app/                         → só rotas; page.tsx renderiza a <Feature>View
app/api/webhooks/*           → só webhooks externos (Mercado Pago)
features/<dominio>/<feature>/{<feature>-view.tsx, action/, schema/}
features/shared/             → código usado por mais de uma feature
features/shared/lib/db/      → client Prisma único e camada de acesso com permissão
components/                  → UI genérica (apresentação pura)
prisma/                      → schema.prisma, migrations/, seed.ts
deploy/, docker-compose.yml, Dockerfile → servidor local
```

- **Nunca importe de dentro de outra feature.** O código compartilhado vai para `features/shared/`.
- Schema Zod **nunca inline**: fica em `schema/`, num arquivo coeso por feature, e o mesmo schema valida no client e na action.
- Nomes: arquivos e pastas em `kebab-case`, componentes em `PascalCase`, funções e variáveis em `camelCase`.
- Prettier: sem ponto e vírgula, aspas duplas, 2 espaços, `printWidth: 80`, `trailingComma: es5` e `endOfLine: lf`.
- **Toda função exportada tem JSDoc** (RNF08). Componentes e utilitários são reaproveitados, nunca duplicados (RNF09).

## 6. Regra de ouro: lógica só em Server Action

- Regra de negócio, acesso ao banco e mutação vivem em `action/*.ts` (`"use server"`). A action segue esta ordem:
  1. Revalida o input com Zod.
  2. Obtém o usuário da sessão e checa a permissão.
  3. Opera via Prisma.
  4. Retorna `{ success: true, ... } | { success: false; error }`, sem lançar exceção para a UI.
- Views `"use client"` só cuidam de apresentação e estado de UI. Nunca acessam o banco nem decidem o que é permitido.
- **Permissões:** o MySQL não tem RLS, então toda leitura ou escrita passa por `requirePermission()` e pela camada de `features/shared/lib/db/`, que aplica o escopo do usuário (conta corporativa, dono do pedido). O id do usuário vem **da sessão, nunca do request**. Esconder botão é só UX.
- Operações em mais de uma tabela (pedido, estoque, aprovação, estorno) rodam em `prisma.$transaction`, e a reserva de estoque usa `SELECT ... FOR UPDATE`.
- Erros nunca expõem stack trace nem detalhe interno (RNF05). Ações sensíveis gravam log de auditoria na mesma transação (RNF12).

## 7. Banco de dados (MySQL 8 + Prisma)

- `prisma/schema.prisma` é a fonte da verdade. Tabelas e colunas em inglês e `snake_case`, via `@@map`/`@map`.
- **Mudança de schema só por migration** (`npx prisma migrate dev --name <slug>`), versionada no mesmo PR. **É proibido alterar o banco à mão**, por cliente SQL ou `db push`, no servidor local de entrega.
- As migrations seguem expand/contract: adicionar antes e remover só depois que nada mais usa o objeto.
- Tipos:
  - Dinheiro em `DECIMAL(12,2)`, nunca `Float`.
  - Datas em UTC.
  - Charset `utf8mb4`.
  - FKs explícitas e `UNIQUE` em CPF, CNPJ, e-mail, SKU e `payment_id`.
  - Índices nas colunas de filtro.
- Exclusão feita pelo usuário é soft delete (`deleted_at`).
- Valores configuráveis das regras de negócio (RN01, RN06, RN14, RN16, RN20) ficam na tabela de configuração e no `prisma/seed.ts`, **nunca fixos no código**.
- Nenhum dado de cartão chega ao backend nem ao banco (RN19). Senha só como hash.
- Depois de mudar o schema: `npx prisma validate`, `npx prisma migrate dev` e testes.

## 8. Servidor local (Docker, acessível pela rede)

- `docker compose up -d` sobe `proxy` (Caddy, 80/443), `app`, `db` (MySQL, 3306) e `backup`. Outros dispositivos acessam por `https://<ip-da-máquina>`. Detalhes em `ARCHITECTURE.md`, seção 5.1.
- As portas ficam liberadas só no perfil de rede **Privada**. O MySQL aceita só usuários nomeados, restritos à sub-rede e com TLS. O `root` não tem acesso remoto, e o app usa um usuário sem DDL.
- Toda mudança de infraestrutura (compose, Dockerfile, Caddyfile) tem que funcionar com `docker compose up -d` numa máquina limpa e é testada a partir de outro dispositivo da rede.
- Segredos ficam só no `.env` (não versionado). Variável nova entra no `.env.example`, sem valor real.

## 9. Integrações externas

- Mercado Pago, ViaCEP, Correios, transportadora, BrasilAPI e NF-e ficam em `features/shared/lib/<integracao>/`, como `server-only`. Toda chamada tem timeout, fallback (RN20, RN21) e log sem headers, payload ou dados pessoais.
- Tudo roda em **sandbox ou homologação**, com dados fictícios identificados como tal.
- **Webhook do Mercado Pago:** valida a assinatura, é idempotente e confirma o pedido só com `approved` (RN13). Ele chega ao servidor por um túnel (`cloudflared`) restrito à rota do webhook, e uma reconciliação por `GET /v1/payments/{id}` cobre o webhook que não chegar.

## 10. Fluxo Git

- `master` é a entrega e só recebe PR de release (`develop → master`, com bump da `version` do `package.json`) ou `patch/*`. `develop` é a próxima versão, sempre funcionando.
- Uma branch curta por issue, a partir da `develop`: `<type>/<issue>-<slug>` (ex.: `feat/24-plp-filters`). O PR para a `develop` entra **só com a issue completa**.
- **Commits** em [Conventional Commits](https://www.conventionalcommits.org/), em inglês (`feat`, `fix`, `refactor`, `perf`, `chore`, `docs`, `test`), com rodapé `Closes #N` (resolve a issue) ou `Refs #N` (trabalho parcial).
- **PR:** título `<type>(<scope>): <descrição imperativa>`, em inglês, e descrição com `Closes #N`. Merge sempre com **"Create a merge commit"**, sem squash e sem rebase.
- Nunca commitar `.env`, dumps de banco, `backups/` ou credenciais. Nunca fazer `push --force` na `develop` ou na `master`.

## 11. Issues, Kanban e rastreabilidade

- Toda issue tem **um** `tipo: *`, **um** `área: *` e os labels de preocupação que couberem (`segurança`, `banco`, `performance`, `infra`, `observabilidade`, `testes`, `documentação`, `escopo a validar` e `accessibility`). Não há épicos nem sub-issues.
- Milestone = versão. Prioridade, esforço, etapa e status são campos do GitHub Project, não labels.
- **Status**, igual no Project e no Trello: Backlog → Em andamento (branch criada) → Em revisão (PR aberto, CI verde) → Em teste (PR aprovado, testes passando no servidor local) → Em validação (critérios conferidos com o RF, RN ou RNF) → Concluído (PR mesclado, critérios marcados). O impedido vai para **Bloqueado**, com o motivo comentado.
- **Escopo novo ou alterado:**
  1. Atualizar a issue no GitHub.
  2. Refletir a mudança em `docs/AtelierBureau_Issues.md` e `docs/AtelierBureau_Trello_Etapas.md`.
  3. Se for requisito novo, registrar no `.docx`, com código RF, RN ou RNF novo e uma NC no histórico.
- Uma decisão sem código fecha a issue à mão, com comentário dizendo o que foi decidido.

## 12. Definição de pronto (antes de abrir o PR)

1. Todos os critérios de aceite da issue foram atendidos.
2. `npx prettier --write <arquivos editados>`, `npm run lint`, `npm run typecheck` e `npm test` passam, e `npx prisma validate` também, se o schema mudou.
3. Os testes cobrem a regra de negócio da issue. Fluxos críticos (frete, estoque, pagamento, aprovação) têm teste de integração (RNF07).
4. A UI é responsiva nos três breakpoints, navegável por teclado, com contraste AA e textos alternativos (RNF13, RNF15).
5. Não há segredo, `console.log` de depuração nem código comentado sem uso.
6. Se mudou o schema, a migration está incluída. Se mudou a infraestrutura, o `docker compose up -d` foi testado do zero.
