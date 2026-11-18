# Relatório do teste de carga (RNF02)

- **Data:** 2026-11-18T16:58:14.941Z
- **Servidor:** https://localhost
- **Premissa de tráfego médio:** 10 usuários simultâneos, pausa média de 1000 ms entre páginas (premissa a validar)
- **Carga:** 3x (30 usuários simultâneos), 60 s por fase
- **Resultado:** aprovado

## Fases

| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|---|---|
| Tráfego médio (1x) | 10 | 537 | 9 | 42 | 394 | 2328 | 2 (0,37%) |
| Carga (3x) | 30 | 1695 | 28,3 | 33 | 113 | 252 | 1 (0,06%) |

## Limites

| Limite | Valor | Medido na carga |
|---|---|---|
| p95 | até 500 ms | 113 ms |
| p99 | até 1000 ms | 252 ms |
| Taxa de erro | até 1,00% | 0,06% |
| Degradação do p95 (carga / tráfego médio) | até 2x | 0,29x |

## Carga por rota

| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|
| `/` | 483 | 30 | 96 | 258 | 1 (0,21%) |
| `/busca?q=caneta` | 190 | 36 | 122 | 261 | 0 (0,00%) |
| `/busca?q=mesa` | 174 | 36 | 151 | 258 | 0 (0,00%) |
| `/categoria/escrita-fina` | 245 | 33 | 126 | 229 | 0 (0,00%) |
| `/categoria/mobiliario-ergonomico` | 177 | 34 | 109 | 162 | 0 (0,00%) |
| `/produto/caneta-tinteiro-heritage` | 266 | 33 | 113 | 177 | 0 (0,00%) |
| `/produto/poltrona-executiva-walnut` | 160 | 40 | 135 | 295 | 0 (0,00%) |
