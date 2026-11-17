# Atelier Bureau — Orçamento de performance

Issue #78 · RNF10.

## Metas

| Métrica | Meta | Onde se mede |
|---|---|---|
| LCP das páginas de vitrine (home, categoria, produto, busca) | até 2,5 s em 4G | Lighthouse do Chrome (modo navegação, celular, limitação "Slow 4G") contra o servidor de entrega (VPS) |
| Tempo de resposta da API | p95 de até 500 ms, exceto chamadas a serviços externos | `npm run perf:api -- https://<domínio-ou-ip-do-servidor>` |
| JavaScript da primeira carga (gzip) | home, categoria e busca até 235 KB; produto até 270 KB | `npm run perf:budget`, no CI depois do build |
| CSS da primeira carga (gzip) | até 15 KB | `npm run perf:budget`, no CI depois do build |

Os valores ficam em `performance-budget.json`. O orçamento de JavaScript e CSS foi medido no build de 14/11/2026 (home 211 KB, produto 247 KB e CSS 11 KB), com cerca de 10% de folga. Aumentar o orçamento é decisão registrada no PR.

## Como medir

1. **Orçamento de bundle (automático):** `npm run build && npm run perf:budget`. O script lê os manifestos do `.next`, soma os arquivos da primeira carga de cada rota de vitrine e falha se passar do orçamento. Roda no CI.
2. **Latência (servidor com banco e seed, de preferência a VPS):** `npm run perf:api -- https://<domínio-ou-ip-do-servidor> 100`. Faz 100 requisições por caminho, com 10 clientes em paralelo, depois de aquecer o cache, e falha se algum p95 passar de 500 ms ou houver erro. Os caminhos ficam em `apiPaths` no `performance-budget.json`. Não roda no CI, que ainda não tem MySQL.
3. **LCP:** Lighthouse no Chrome, perfil celular com "Slow 4G", nas URLs de home, categoria, produto e busca do servidor de entrega (VPS). Registrar o resultado no PR de release.

## Otimizações aplicadas

- Imagens já saem em WebP com `srcset` (320, 640, 1024 e 1600 px), geradas pelo `sharp` no upload, e o `/media` responde com `Cache-Control: public, max-age=31536000, immutable`.
- A imagem principal do produto, o primeiro slide da home e a primeira linha de cards da listagem carregam com `fetchpriority="high"`. As demais imagens usam `loading="lazy"` e `decoding="async"`.
- Catálogo, categorias, produto, sugestões de busca e sitemap usam `"use cache"` com tags invalidadas pelo back office, então a vitrine não consulta o banco a cada visita. As consultas da listagem rodam em paralelo (`Promise.all`) e usam os índices `products(category_id, status)` e `skus(product_id)`.
- Fontes com `next/font` e `display: swap`, sem requisição a servidores externos.

## Teste de carga (RNF02, issue #79)

O RNF02 pede estabilidade sob picos, com ao menos **3x o tráfego médio**. O teste fica em `scripts/load-test.ts` e não usa dependência nova: são usuários virtuais com `fetch` concorrente.

### Premissa de tráfego médio (premissa a validar)

O levantamento de requisitos não define o tráfego médio. Até a validação com o professor ou o cliente, o projeto adota:

| Item | Premissa | Onde se configura |
|---|---|---|
| Tráfego médio | **10 usuários simultâneos** navegando na vitrine, com pausa média de 1 s entre páginas (cerca de 9 req/s) | `loadTest.baselineUsers` e `loadTest.thinkTimeMs` |
| Pico simulado | 3x o tráfego médio: **30 usuários simultâneos** (cerca de 27 req/s) | `loadTest.multiplier` |
| Duração | 60 s por fase | `loadTest.durationSeconds` |
| Mistura de rotas | home 30%, categoria 25%, produto 25% e busca 20%, com slugs do seed | `loadTest.paths` |

A premissa é deliberadamente conservadora para uma loja high ticket de nicho, com baixo volume e ticket alto. **Premissa a validar:** se o tráfego médio esperado for outro, basta mudar `baselineUsers` no `performance-budget.json` ou passar `--users N` na linha de comando.

### Limites (premissa a validar)

O teste reprova a fase de carga (3x) se passar de qualquer limite abaixo, que fica em `loadTest.limits`:

| Limite | Valor | Motivo |
|---|---|---|
| p95 | até 500 ms | Mesma meta de tempo de resposta do RNF10, que vale também no pico |
| p99 | até 1.000 ms | Cauda sem pausas perceptíveis |
| Taxa de erro | até 1% | Erros de rede, timeout de 10 s e respostas fora de 2xx contam como erro |
| Degradação do p95 | até 2x o p95 do tráfego médio | Define "degradação perceptível" do RNF02 |

### Como executar

No servidor de entrega (VPS), com o banco, as migrations e o seed aplicados (`docker compose up -d`). Contra a VPS, o certificado é público e o `NODE_EXTRA_CA_CERTS` não é necessário:

```bash
npm run perf:load -- https://<domínio> --out docs/relatorios/teste-de-carga-<data>.md
```

No servidor local:

```bash
NODE_EXTRA_CA_CERTS=deploy/certs/root.crt npm run perf:load -- https://<ip-do-servidor> --out docs/relatorios/teste-de-carga-<data>.md
```

Opções: `--users N` (tráfego médio), `--multiplier N`, `--duration S` e `--think MS`. O script aquece o cache uma vez, roda a fase de tráfego médio (1x) e depois a fase de carga (3x), mede p50, p95 e p99, a taxa de erro e as requisições por segundo, no geral e por rota, e imprime o relatório em Markdown. Com `--out`, grava o mesmo relatório no arquivo. O código de saída é 1 quando algum limite é violado.

No servidor local, como o Caddy usa `tls internal`, o Node precisa confiar na autoridade certificadora local: exporte `deploy/certs/root.crt` (`deploy/export-root-cert.sh` ou `.ps1`) e rode com `NODE_EXTRA_CA_CERTS=deploy/certs/root.crt`. Sem isso, toda requisição HTTPS falha e conta como erro.

Não roda no CI, que não tem MySQL nem o servidor no ar. Rodar a partir de outra máquina (fora da VPS, ou de outro dispositivo da rede no servidor local) mede também o proxy (Caddy), o TLS e a rede, como o cliente real.

### Situação

- O script, a configuração e os testes unitários (`tests/perf/load-test.test.ts`) estão prontos. A execução foi conferida contra um servidor HTTP de teste, sem o app.
- **Pendente:** a execução real contra o app com banco e seed, no servidor de entrega, e o relatório anexado à issue #79. A máquina de desenvolvimento não tinha MySQL nem Docker disponíveis em 17/11/2026.
