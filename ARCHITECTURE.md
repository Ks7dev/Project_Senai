# Arquitetura — Atelier Bureau

Padrão técnico do projeto (issue #1, RNF07): stack, organização de código, regras de implementação e fluxo de trabalho. Toda contribuição segue este documento.

## 1. Stack

| Camada | Escolha |
|---|---|
| Framework | **Next.js 16** (App Router) + **React 19** + **TypeScript** `strict` |
| UI | **Tailwind CSS v4** (config em `app/globals.css`, sem `tailwind.config.js`), **shadcn/ui** (style `base-nova`, primitivas `@base-ui/react`), ícones **`lucide-react`** (decisão da #3), `framer-motion`, `next-themes` |
| Formulários | `react-hook-form` + `zod` + `@hookform/resolvers/zod` |
| Dados | **Supabase**: Postgres com RLS, Auth e Storage (`@supabase/ssr` + `@supabase/supabase-js`) |
| Listagens | `@tanstack/react-table` v9 + `@tanstack/react-query` v5 |
| Imagens | `sharp` no servidor: valida, converte para WebP com até 300 KB e gera versões responsivas (RNF04) |
| Qualidade | ESLint (`eslint-config-next`) + Prettier (`prettier-plugin-tailwindcss`) + `tsc --noEmit` |
| Testes (RNF07) | **Vitest**: unitários de schema, action e regras de negócio. **Playwright**: ponta a ponta do fluxo de compra |
| Documentação de código (RNF08) | **JSDoc** em toda função exportada, cobrado por `eslint-plugin-jsdoc` |
| Hospedagem | Vercel (app) + Supabase (banco, auth, storage), sempre por HTTPS (RNF06) |

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
supabase/migrations/    → migrations versionadas (uma por mudança coesa)
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
| Model | Tabelas Supabase com RLS + `schema/` (Zod e tipos) |
| View | `*-view.tsx` e componentes da feature |
| Controller | `action/*.ts` (Server Actions) e, só para webhooks, `app/api/webhooks/*` |

## 3. Regra de ouro: lógica só em Server Action

- Regra de negócio, chamada ao Supabase, validação sensível e mutação ficam em `action/*.ts`. A action recebe o input, **revalida com Zod**, checa a permissão, chama o Supabase e retorna `{ success: true, ... } | { success: false; error: "..." }`, em vez de lançar exceção.
- Views `"use client"` nunca falam com o Supabase nem decidem o que é permitido. O client de browser serve só para sessão e realtime (status do pagamento em tempo real, RF31).
- Erros nunca expõem stack trace nem detalhe interno (RNF05).
- **Integração de saída** (Mercado Pago, Correios, transportadora, NF-e, BrasilAPI, ViaCEP) fica em `features/shared/lib/<integracao>/`. É `server-only`, só roda depois da checagem de permissão, tem chave em env sem `NEXT_PUBLIC_`, timeout e fallback (RN20, RN21), e o log sai sem headers, payload ou dados de cartão.
- **Webhook do Mercado Pago** (Route Handler): valida a assinatura, processa de forma idempotente e confirma o pedido só com `approved` (RN13).

## 4. Permissões (RBAC) em duas camadas

- Tabelas com RLS obrigatório e declarado explicitamente. A permissão é verificada por função `SECURITY DEFINER` no schema `private`, com `auth.uid()`, e **nunca** recebe `user_id`.
- Permissões no formato `"<resource>[:<sub>]:<action>"`, em inglês.
- Toda operação é verificada **na RLS e na Server Action**. Esconder botão ou menu é só UX.
- As flags de permissão da UI são calculadas uma vez no `page.tsx` e descem por prop.
- Dois conjuntos de perfis:
  - Internos (RF55): administrador, comercial, financeiro e estoque/logística.
  - Da conta corporativa (RF10, RN08): solicitante, aprovador, financeiro e administrador da conta.
- Client admin (service role) é exceção e só pode ser usado dentro de uma action, depois da checagem de permissão.
- Soft delete feito pelo usuário é sempre uma RPC no banco. Ações sensíveis gravam log de auditoria (RNF12).

## 5. Banco e migrations

- Migrations em `supabase/migrations/`, testadas na stack local (`supabase db reset`) e aplicadas só pelo merge na `master`. Nunca se escreve no banco pelo MCP ou pelo painel.
- Migrations seguem expand/contract: adiciona antes e remove só depois que a release que parou de usar o objeto chegou à `master`.
- Depois de toda mudança de schema, rode `supabase db advisors --local --type security`.
- Valores configuráveis das regras de negócio (#5) ficam numa tabela de configuração com seed (#8).

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
