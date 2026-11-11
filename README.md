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
| `npm run test:integration` | Testes de integração das actions contra o MySQL (precisa do banco com migrations e seed) |
| `npm run db:migrate` | Cria e aplica migrations em desenvolvimento |
| `npm run db:deploy` | Aplica as migrations pendentes (servidor) |
| `npm run db:seed` | Carrega configurações, catálogo e contas fictícias |

## Servidor local (Docker)

A máquina com o projeto é o servidor, e os outros dispositivos da rede acessam por `https://<ip-da-máquina>` (detalhes em `ARCHITECTURE.md`, seção 5.1).

1. Instale o Docker Desktop e reserve um IP fixo para a máquina no roteador.
2. Copie `.env.example` para `.env` e preencha `SITE_HOST`, as senhas do MySQL e o `BETTER_AUTH_SECRET`.
3. Suba tudo:

   ```bash
   docker compose up -d
   ```

4. Carregue os dados fictícios (só na primeira vez):

   ```bash
   docker compose exec app node ./node_modules/prisma/build/index.js db seed
   ```

5. Exporte o certificado raiz do HTTPS local e instale em cada dispositivo:

   ```bash
   sh deploy/export-root-cert.sh
   ```

6. No Firewall do Windows, libere as portas 80 e 443 só no perfil de rede **Privada**. O MySQL (3306) fica só nesta máquina; para abri-lo à rede, defina `MYSQL_PUBLISH_ADDR=0.0.0.0` no `.env` e libere a 3306 também no perfil Privado.

Serviços: `proxy` (Caddy, portas 80 e 443), `app` (Next.js, só na rede interna), `db` (MySQL 8.4, porta 3306 em `127.0.0.1`) e `backup` (`mysqldump` diário em `./backups`, 30 dias de retenção).

As contas de teste estão em `prisma/seed-data.ts`, e a senha delas é a do `SEED_PASSWORD`.

## Versão

A versão do projeto é a `version` do `package.json`. Cada release (`develop → master`) sobe a versão e gera uma tag `vX.Y.Z` com as notas de release.
