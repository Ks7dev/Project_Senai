# Análise de atualizações tecnológicas

Levantamento de 18/11/2026, na branch `develop` (com as otimizações do PR #218). As versões vêm de `npm outdated` e `npm view <pacote>` executados nesta data. **Nada foi atualizado automaticamente.**

## Resumo

- O núcleo está na versão mais recente: Next.js 16.4.6, React 19.3.0 (falta só o patch 19.3.1), Prisma 7.10.1, Zod 4.6.7, Vitest 5.1.0, Playwright 1.65.1, sharp 0.35.5, Node 24 LTS e MySQL 8.4 LTS.
- Há **patches e minors seguros** (prioridade alta, esforço baixo): better-auth, react, tailwindcss, nodemailer, react-hook-form, lucide-react, prettier, @hookform/resolvers, axe-core e eslint-plugin-jsdoc.
- Há **majors** que pedem avaliação própria: ESLint 10, TypeScript 7 e jsdom 31.
- **Prisma 8 ainda é RC**: não atualizar.
- A vulnerabilidade alta do `picomatch` (#213) não tem versão corrigida publicada. A correção depende do upstream.

## Dependências npm

| Pacote | Atual | Recomendada | Compatibilidade | Benefícios | Riscos / breaking changes | Afetados | Esforço | Prioridade |
|---|---|---|---|---|---|---|---|---|
| better-auth | 1.7.20 | 1.7.25 | Patch, mesma API | Correções de segurança e bugs da linha 1.7 | Baixo. Conferir o changelog de 2FA e organizações | Login, 2FA, organizações, testes de integração | Baixo | **Alta** (biblioteca de autenticação) |
| react / react-dom | 19.3.0 | 19.3.1 | Patch | Correções | Baixo. Manter as duas versões iguais | Todo o app | Baixo | Alta |
| tailwindcss / @tailwindcss/turbopack | 4.3.3 | 4.3.5 | Patch | Correções do scanner e do Turbopack | Baixo. Conferir o CSS gerado (hoje 63.392 bytes) | Estilos | Baixo | Média |
| nodemailer | 10.5.0 | 10.6.0 | Minor | Correções | Baixo | Fila de e-mail | Baixo | Média |
| react-hook-form | 7.91.0 | 7.92.0 | Minor | Correções | Baixo | Formulários | Baixo | Média |
| @hookform/resolvers | 7.0.5 | 7.0.7 | Patch | Correções do resolver Zod 4 | Baixo | Formulários | Baixo | Média |
| lucide-react | 1.71.0 | 1.74.0 | Minor | Ícones novos | Ícone renomeado pode quebrar o import (o typecheck pega) | Componentes | Baixo | Baixa |
| prettier | 3.9.10 | 3.10.1 | Minor | Correções | Pode reformatar arquivos. Rodar `format` num commit separado | Todo o código | Baixo | Baixa |
| axe-core, eslint-plugin-jsdoc | 4.14.0, 65.4.5 | 4.14.1, 65.4.11 | Patch | Correções | Novas regras podem gerar avisos | Testes de a11y, lint | Baixo | Baixa |
| eslint | 9.39.5 | 10.15.0 | **Major**. O `eslint-config-next` 16.4.6 precisa declarar suporte ao ESLint 10 | Desempenho, flat config consolidada | Plugins sem suporte ao 10; regras removidas | `eslint.config.mjs`, CI | Médio | Baixa (avaliar quando o `eslint-config-next` suportar) |
| typescript | 5.9.3 | 7.0.2 | **Major** (compilador nativo em Go) | Typecheck muito mais rápido (hoje 30–40 s) | O plugin `next` do tsconfig, o `next typegen` e o `typescript-eslint` precisam suportar o TS 7. Há mudanças em opções antigas | Typecheck, lint, build | Médio/alto | Média. Testar numa branch, porque o ganho de tempo é grande |
| jsdom | 27.4.0 | 31.0.1 | **Major** | — | Não há uso encontrado: nenhum import e nenhum `environment: "jsdom"` | — | Baixo | **Remover** a dependência em vez de atualizar, depois de confirmar com `npm test` |
| @types/node | 24.19.2 | 26.6.6 | Acompanhar o Node do runtime | — | O Node 26 não é LTS ainda. Os tipos do 26 permitem APIs que não existem no Node 24 | — | — | **Não atualizar**: manter o major 24 |
| prisma / @prisma/client / adapter-mariadb | 7.10.1 | 7.10.1 (8.0.0 é RC) | — | — | O 8.0 ainda é release candidate | Banco | — | Aguardar o 8.0 estável |
| next / eslint-config-next | 16.4.6 | 16.4.6 | Atual | — | — | — | — | — |
| zod, vitest, @playwright/test, sharp, @base-ui/react, shadcn | atuais | — | — | — | — | — | — | — |
| picomatch (transitiva) | 4.0.7 | sem correção | — | Remove a GHSA-fc5q-39xc-vjpf | Não há versão corrigida | Lint, Vitest, Tailwind | — | Bloqueada (#213) |

## Ajustes de dependências encontrados no mapeamento

| Item | Situação | Recomendação | Prioridade |
|---|---|---|---|
| `shadcn` (CLI) em `dependencies` | Só o CSS `shadcn/tailwind.css` é usado, no build | Mover para `devDependencies`, junto com `tw-animate-css` (o build do Docker instala as dev) | Baixa |
| `cn` 0.5.2 | Pacote oficial do `shadcn-ui/cn` (substitui clsx + tailwind-merge); expõe um binário | Manter. Conferir a procedência no `package-lock.json` | Baixa |
| `@better-auth/utils` | Importado nos testes de integração sem estar declarado | Declarar em `devDependencies` | Baixa |
| `jsdom` | Sem uso encontrado | Remover | Baixa |

## Runtime, imagens e banco

| Componente | Atual | Recomendação | Observação | Prioridade |
|---|---|---|---|---|
| Node.js | 24.16 local; `node:24-alpine` na imagem | Manter o Node 24 LTS | O LTS vai até 2028 | — |
| MySQL | `mysql:8.4` (LTS) | Manter. **Fixar por digest** | 8.4 é a linha LTS. O 9.x é inovação e não deve ir para a entrega | Média (fixar) |
| Caddy | `caddy:2` | Fixar `caddy:2.x.y` ou o digest | A tag flutuante muda sem aviso | Média |
| cloudflared | `cloudflare/cloudflared:latest` | **Fixar uma versão** | `latest` em produção torna o build imprevisível | Média |
| Uptime Kuma | `louislam/uptime-kuma:1` | Avaliar a linha 2.x antes de migrar | A 2.x mudou o banco interno. Exige migração dos monitores | Baixa |

## Padrões e ferramentas de segurança

| Item | Hoje | Recomendação | Prioridade |
|---|---|---|---|
| GitHub Actions | Fixadas por tag (`@v4`) | Fixar por SHA | Média |
| Varredura de dependências | `npm audit` no CI | Adicionar Dependabot (atualizações de segurança) | Média |
| Análise estática de segurança | Inexistente | Adicionar CodeQL (gratuito em repositório público) | Média |
| Varredura de segredos | Inexistente no CI | Ativar o secret scanning e o push protection do GitHub | Média |

## Tecnologias descontinuadas

Nenhuma dependência direta está descontinuada (deprecated) no npm. A única versão sem suporte a caminho é o ESLint 9, que ficou em `maintenance` desde o lançamento do 10.

## Ordem sugerida

1. Uma branch só com os patches e minors seguros (better-auth, react, tailwind, nodemailer, rhf, resolvers e prettier). Validar com lint, typecheck, unit, integração e build.
2. Remover o `jsdom`, mover o `shadcn` e o `tw-animate-css` para dev e declarar o `@better-auth/utils`.
3. Fixar as imagens Docker e as Actions.
4. Testar o TypeScript 7 numa branch experimental, por causa do ganho no typecheck.
5. Aguardar o ESLint 10 no `eslint-config-next` e o Prisma 8 estável.
