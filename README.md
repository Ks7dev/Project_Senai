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

## Versão

A versão do projeto é a `version` do `package.json`. Cada release (`develop → master`) sobe a versão e gera uma tag `vX.Y.Z` com as notas de release.
