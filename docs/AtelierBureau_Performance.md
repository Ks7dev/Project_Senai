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
2. **Latência (servidor local, com banco e seed):** `npm run perf:api -- https://<ip-do-servidor> 100`. Faz 100 requisições por caminho, com 10 clientes em paralelo, depois de aquecer o cache, e falha se algum p95 passar de 500 ms ou houver erro. Os caminhos ficam em `apiPaths` no `performance-budget.json`. Não roda no CI, que ainda não tem MySQL.
3. **LCP:** Lighthouse no Chrome, perfil celular com "Slow 4G", nas URLs de home, categoria, produto e busca do servidor local. Registrar o resultado no PR de release.

## Otimizações aplicadas

- Imagens já saem em WebP com `srcset` (320, 640, 1024 e 1600 px), geradas pelo `sharp` no upload, e o `/media` responde com `Cache-Control: public, max-age=31536000, immutable`.
- A imagem principal do produto, o primeiro slide da home e a primeira linha de cards da listagem carregam com `fetchpriority="high"`. As demais imagens usam `loading="lazy"` e `decoding="async"`.
- Catálogo, categorias, produto, sugestões de busca e sitemap usam `"use cache"` com tags invalidadas pelo back office, então a vitrine não consulta o banco a cada visita. As consultas da listagem rodam em paralelo (`Promise.all`) e usam os índices `products(category_id, status)` e `skus(product_id)`.
- Fontes com `next/font` e `display: swap`, sem requisição a servidores externos.
