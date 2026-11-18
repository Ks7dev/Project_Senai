# Atelier Bureau — Orçamento de performance

Issue #78 · RNF10.

## Metas

| Métrica | Meta | Onde se mede |
|---|---|---|
| LCP das páginas de vitrine (home, categoria, produto, busca) | até 2,5 s em 4G | Lighthouse do Chrome (modo navegação, celular, limitação "Slow 4G") contra o servidor local |
| Tempo de resposta da API | p95 de até 500 ms, exceto chamadas a serviços externos | `npm run perf:api -- https://<ip-do-servidor>` |
| JavaScript da primeira carga (gzip) | home, categoria e busca até 235 KB; produto até 270 KB | `npm run perf:budget`, no CI depois do build |
| CSS da primeira carga (gzip) | até 15 KB | `npm run perf:budget`, no CI depois do build |

Os valores ficam em `performance-budget.json`. O orçamento de JavaScript e CSS foi medido no build de 14/11/2026 (home 211 KB, produto 247 KB e CSS 11 KB), com cerca de 10% de folga. Aumentar o orçamento é decisão registrada no PR.

## Como medir

1. **Orçamento de bundle (automático):** `npm run build && npm run perf:budget`. O script lê os manifestos do `.next`, soma os arquivos da primeira carga de cada rota de vitrine e falha se passar do orçamento. Roda no CI.
2. **Latência (servidor local, com banco e seed):** `npm run perf:api -- https://<ip-do-servidor> 100`. Faz 100 requisições por caminho, com 10 clientes em paralelo, depois de aquecer o cache, e falha se algum p95 passar de 500 ms ou houver erro. Os caminhos ficam em `apiPaths` no `performance-budget.json`. Não roda no CI: o workflow `E2E` sobe um MySQL para o Playwright, mas não roda o `perf:api`.
3. **LCP:** Lighthouse no Chrome, perfil celular com "Slow 4G", nas URLs de home, categoria, produto e busca do servidor local. Registrar o resultado no PR de release.

## Otimizações aplicadas

- Imagens já saem em WebP com `srcset` (320, 640, 1024 e 1600 px), geradas pelo `sharp` no upload, e o `/media` responde com `Cache-Control: public, max-age=31536000, immutable`.
- A imagem principal do produto, o primeiro slide da home e a primeira linha de cards da listagem carregam com `fetchpriority="high"`. As demais imagens usam `loading="lazy"` e `decoding="async"`.
- Catálogo, categorias, produto, sugestões de busca e sitemap usam `"use cache"` com tags invalidadas pelo back office, então a vitrine não consulta o banco a cada visita. As consultas da listagem rodam em paralelo (`Promise.all`) e usam os índices `products(category_id, status)` e `skus(product_id)`.
- Fontes com `next/font` e `display: swap`, sem requisição a servidores externos.
- **Cluster de workers (#79):** o app roda `APP_WORKERS` processos Node.js (padrão 4) na mesma porta, em vez de um só. Detalhes na seção "Teste de carga" abaixo e em `ARCHITECTURE.md`, seção 5.1.

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

No servidor local de entrega, com o banco, as migrations e o seed aplicados (`docker compose up -d`):

```bash
NODE_EXTRA_CA_CERTS=deploy/certs/root.crt npm run perf:load -- https://<ip-do-servidor> --out docs/relatorios/teste-de-carga-<data>.md
```

Opções: `--users N` (tráfego médio), `--multiplier N`, `--duration S` e `--think MS`. O script aquece o cache uma vez, roda a fase de tráfego médio (1x) e depois a fase de carga (3x), mede p50, p95 e p99, a taxa de erro e as requisições por segundo, no geral e por rota, e imprime o relatório em Markdown. Com `--out`, grava o mesmo relatório no arquivo. O código de saída é 1 quando algum limite é violado.

Como o Caddy usa `tls internal`, o Node precisa confiar na autoridade certificadora local: exporte `deploy/certs/root.crt` (`deploy/export-root-cert.sh` ou `.ps1`) e rode com `NODE_EXTRA_CA_CERTS=deploy/certs/root.crt`. Sem isso, toda requisição HTTPS falha e conta como erro.

Não roda no CI, que não tem MySQL nem o servidor no ar. Rodar a partir de outro dispositivo da rede mede também o proxy (Caddy) e o TLS, como o cliente real.

### Situação

- O script, a configuração e os testes unitários (`tests/perf/load-test.test.ts`) estão prontos.
- **Primeira execução real (17/11/2026):** reprovada ([`relatorios/teste-de-carga-2026-11-17.md`](relatorios/teste-de-carga-2026-11-17.md)). Sem erros, mas sob 3x o p95 foi 699 ms, o p99 1.405 ms e a degradação do p95 6,5x. A repetição antes da correção ([`relatorios/teste-de-carga-2026-11-17-repeticao.md`](relatorios/teste-de-carga-2026-11-17-repeticao.md)) deu p95 866 ms, p99 1.449 ms e degradação 13,75x. `npm run perf:api` passou.
- **Depois da correção (18/11/2026):** aprovada ([`relatorios/teste-de-carga-2026-11-18.md`](relatorios/teste-de-carga-2026-11-18.md)).

### Causa da latência sob carga (#79)

- **Não era o banco.** Cada página faz no máximo 3 `SELECT` por requisição (medido pelo contador `Com_select` do MySQL): catálogo, categorias, produto e conteúdo da home vêm do `"use cache"`. Em repouso o MySQL fica perto de 1% de CPU, com picos curtos de rotinas internas do InnoDB depois de uma carga. O pool do adapter MariaDB (10 conexões por processo) nunca ficou cheio.
- **Era a CPU de renderização num processo só.** Cada página gasta de 20 a 35 ms de CPU para renderizar o React (RSC e HTML), mesmo as estáticas, porque o cabeçalho (carrinho e menu) e o rodapé são renderizados a cada requisição. O Node.js usa um núcleo por processo: a 26 req/s o único processo ficava cerca de 75% ocupado, as requisições entravam em fila e a cauda (p95 e p99) disparava. O perfil de CPU tirado do container confirmou: quase todo o tempo em `react-server-dom` e `react-dom/server`, e quase nada no Prisma.
- **Agravante na página de produto:** as faixas de desconto por volume (RN04) eram lidas do banco sem cache durante o prerender do shell. O prerender falhava (`Date.now()` do pool de conexões) e era refeito a cada requisição, com um stack trace no log.

### Correção (#79)

1. **Cluster de workers:** `deploy/app/cluster.mjs` sobe `APP_WORKERS` processos (padrão 4, nunca mais que as CPUs) na porta 3000. O primeiro é o coordenador: só ele roda os jobs e a criptografia de dados legados, e guarda os contadores do rate limit (RNF05), que os outros consultam por IPC. Worker que cai é reiniciado com o mesmo papel.
2. **Cache coerente entre workers:** o `"use cache"` continua em memória em cada worker, e `deploy/app/cache-handler.mjs` repassa a invalidação de tags do back office (`revalidateTag`) aos demais, que a aplicam no `"use cache"` e no manifest de tags do cache incremental (ISR), então nenhum worker continua mostrando preço ou estoque antigo.
3. **Página de produto:** as faixas de volume só são lidas depois de `connection()`, em tempo de requisição, e o shell volta a ser gerado uma vez.
4. **Aquecimento do teste:** o script aquece cada rota com requisições em paralelo, em algumas rodadas, para chegar a todos os workers, e não só a um.

Nenhuma regra de negócio mudou. Preço, estoque e permissões continuam sendo conferidos no servidor.

### Resultados

| Execução | p95 1x | p95 3x | p99 3x | Degradação | Resultado |
|---|---|---|---|---|---|
| Antes, 1 processo | 63 ms | 866 ms | 1.449 ms | 13,75x | reprovado |
| Depois, 4 workers, aquecido (relatório oficial) | 83 ms | 107 ms | 165 ms | 1,29x | aprovado |
| Depois, 4 workers, aquecido (melhor execução) | 44 ms | 53 ms | 79 ms | 1,20x | aprovado |
| Depois, 4 workers, logo após reiniciar o app (2 execuções) | 48 e 97 ms | 100 e 209 ms | 135 e 293 ms | 2,08x e 2,15x | no limite |

Depois da revisão do PR #219 (18/11/2026, mesma arquitetura, com a invalidação repassada também ao cache ISR), o host estava com outras sessões rodando `npm ci`, Vitest e verificações contra o mesmo servidor, e a RAM livre oscilava entre 0,2 e 2 GB:

| Execução | p95 1x | p95 3x | p99 3x | Degradação | Resultado |
|---|---|---|---|---|---|
| [Revisão, 1ª](relatorios/teste-de-carga-2026-11-18-revisao.md) | 394 ms | 113 ms | 252 ms | 0,29x | aprovado (ruído na fase 1x) |
| [Revisão, 2ª](relatorios/teste-de-carga-2026-11-18-revisao-2.md) | 45 ms | 337 ms | 1.129 ms | 7,49x | reprovado (ruído na fase 3x, 0,5 GB livres) |

Nas duas, o ruído caiu numa fase só, e as outras fases ficaram dentro dos limites. Para a apresentação, rode com a máquina dedicada (sem outras builds ou testes) e com pelo menos 2 GB de RAM livre.

Dentro do container, sem o proxy, o cluster sustentou 30 usuários com p95 41 ms e p99 60 ms (degradação 1,17x).

**Limitações da medição.** O servidor de entrega é um notebook com Docker Desktop, que divide a CPU com outros containers e programas. Com a máquina ocupada ou em throttling térmico, as mesmas imagens deram resultados até 5x piores, inclusive na fase de 1x. Uma execução que coincidiu com o `docker build` de outra branch deu degradação de 5x. Rode o teste com a máquina dedicada, sem build em paralelo, depois de alguns minutos de uso normal do site: logo após `docker compose up`, cada worker ainda compila o código (JIT) e preenche o próprio cache, e a degradação fica perto de 2x.
