# Atelier Bureau

E-commerce high ticket de papelaria nobre e mobiliário executivo, híbrido B2B + B2C (projeto acadêmico SENAI).

- Políticas de desenvolvimento: [`CLAUDE.md`](CLAUDE.md)
- Arquitetura, stack e fluxo Git: [`ARCHITECTURE.md`](ARCHITECTURE.md)
- Requisitos e backlog: [`docs/`](docs/)

## Rodar localmente

Pré-requisito: Node.js 24 ou superior.

```bash
npm install && npm run dev
```

O site abre em `http://localhost:3000`.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`) |
| `npm run format` / `npm run format:check` | Prettier |
| `npm test` | Testes (Vitest) |
| `npm run test:coverage` | Testes com a cobertura mínima de `vitest.config.ts` (verificada no CI) |
| `npm run test:integration` | Testes de integração das actions contra o MySQL (precisa do banco com migrations e seed) |
| `npm run test:e2e` | Fluxo de compra de ponta a ponta (Playwright). Precisa do app com build, MySQL, migrations e seed; roda no workflow `E2E` do CI |
| `npm run db:migrate` | Cria e aplica migrations em desenvolvimento |
| `npm run db:deploy` | Aplica as migrations pendentes (servidor) |
| `npm run db:seed` | Carrega configurações, catálogo e contas fictícias |
| `npm run db:validate` | Valida o `prisma/schema.prisma` (`prisma validate`) |
| `npm run db:docs` | Gera o DER, o MER, o dicionário de dados e o script SQL de `docs/banco-de-dados/` a partir de um banco já migrado |
| `npm run perf:budget` | Confere o JavaScript de primeiro carregamento de cada rota contra o `performance-budget.json` (depois do build; roda no CI) |
| `npm run perf:api` | Mede a latência (mediana e p95) das rotas contra um app rodando (RNF10) |
| `npm run perf:load` | Teste de carga da vitrine contra um app rodando (RNF02) |
| `npm run security:payment-page` | Confere a CSP e os scripts da página de pagamento contra o `deploy/payment-page-baseline.json` (#173) |
| `npm run accounts:rotate-seed` | Troca (ou desativa, com `--disable`) a senha das contas fictícias do seed no servidor de entrega; `--dry-run` só mostra o que mudaria (#179) |

## Servidor local (Docker)

A máquina com o projeto é o servidor, e os outros dispositivos da rede acessam por `https://<ip-da-máquina>` (detalhes em `ARCHITECTURE.md`, seção 5.1).

1. Instale o Docker Desktop e reserve um IP fixo para a máquina no roteador.
2. Copie `.env.example` para `.env` e preencha `SITE_HOST`, as senhas do MySQL, o `BETTER_AUTH_SECRET` e a `DATA_ENCRYPTION_KEY` (`openssl rand -base64 32`). Guarde uma cópia da `DATA_ENCRYPTION_KEY` fora do servidor: sem ela, os CPFs e telefones gravados não podem ser lidos.
3. Suba tudo:

   ```bash
   docker compose up -d
   ```

4. Carregue os dados fictícios (só na primeira vez). O seed roda nesta máquina, fora do container, e usa o `MIGRATION_DATABASE_URL` do `.env` (`localhost:3306`):

   ```bash
   npm ci
   ```

   ```bash
   npm run db:seed
   ```

   A imagem do app não leva o seed: ela só aplica as migrations ao iniciar.

5. Exporte o certificado raiz do HTTPS local e instale em cada dispositivo:

   ```bash
   sh deploy/export-root-cert.sh
   ```

   No Windows, use `powershell -ExecutionPolicy Bypass -File deploy\export-root-cert.ps1`. Depois, confira o HTTPS e os headers de segurança a partir de outro dispositivo da rede:

   ```bash
   sh deploy/check-headers.sh <ip-do-servidor>
   ```

6. No Firewall do Windows, libere as portas 80, 443 e 3001 (painel de disponibilidade) só no perfil de rede **Privada**. O MySQL (3306) fica só nesta máquina; para abri-lo à rede, defina `MYSQL_PUBLISH_ADDR=0.0.0.0` no `.env` e libere a 3306 também no perfil Privado.

Serviços do `docker-compose.yml`:

| Serviço | Porta publicada | Papel |
|---|---|---|
| `proxy` | 80, 443 e 3001 | Caddy: HTTPS do site (o 80 só redireciona) e do painel de disponibilidade na 3001, só para endereços da rede local |
| `app` | nenhuma (3000 só na rede interna) | Next.js |
| `db` | 3306, só em `127.0.0.1` por padrão (`MYSQL_PUBLISH_ADDR`) | MySQL 8.4 |
| `backup` | nenhuma | `mysqldump` diário em `./backups`, 30 dias de retenção |
| `uptime-kuma` | nenhuma (só pelo `proxy`, na 3001) | Painel de disponibilidade e alertas (RNF01, #80) |
| `webhook-gate` | nenhuma | Perfil opcional `tunnel`: repassa ao app só `POST /api/webhooks/mercadopago` |
| `tunnel` | nenhuma (conexão de saída) | Perfil opcional `tunnel`: túnel `cloudflared` que expõe só o `webhook-gate` na internet (`CLOUDFLARE_TUNNEL_TOKEN`) |

O `webhook-gate` e o `tunnel` só sobem com `docker compose --profile tunnel up -d` (`ARCHITECTURE.md`, seção 5.1).

As contas de teste estão em `prisma/seed-data.ts`, e a senha delas é a do `SEED_PASSWORD`. No servidor de entrega, troque ou desative essas contas antes da apresentação, conforme o [checklist de lançamento](docs/AtelierBureau_Checklist_Lancamento.md).

## Versão

A versão do projeto é a `version` do `package.json`. Cada release (`develop → master`) sobe a versão e gera uma tag `vX.Y.Z` com as notas de release.
