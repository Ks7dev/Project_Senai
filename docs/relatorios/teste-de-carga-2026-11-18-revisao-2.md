# Relatório do teste de carga (RNF02)

- **Data:** 2026-11-18T17:00:31.112Z
- **Servidor:** https://localhost
- **Premissa de tráfego médio:** 10 usuários simultâneos, pausa média de 1000 ms entre páginas (premissa a validar)
- **Carga:** 3x (30 usuários simultâneos), 60 s por fase
- **Resultado:** reprovado

## Fases

| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|---|---|
| Tráfego médio (1x) | 10 | 583 | 9,7 | 23 | 45 | 72 | 0 (0,00%) |
| Carga (3x) | 30 | 1624 | 27,1 | 43 | 337 | 1129 | 2 (0,12%) |

## Limites

| Limite | Valor | Medido na carga |
|---|---|---|
| p95 | até 500 ms | 337 ms |
| p99 | até 1000 ms | 1129 ms |
| Taxa de erro | até 1,00% | 0,12% |
| Degradação do p95 (carga / tráfego médio) | até 2x | 7,49x |

## Carga por rota

| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|
| `/` | 485 | 40 | 378 | 1085 | 1 (0,21%) |
| `/busca?q=caneta` | 162 | 43 | 331 | 1773 | 0 (0,00%) |
| `/busca?q=mesa` | 158 | 54 | 346 | 632 | 0 (0,00%) |
| `/categoria/escrita-fina` | 248 | 43 | 323 | 1129 | 0 (0,00%) |
| `/categoria/mobiliario-ergonomico` | 175 | 43 | 322 | 611 | 0 (0,00%) |
| `/produto/caneta-tinteiro-heritage` | 222 | 44 | 398 | 1309 | 1 (0,45%) |
| `/produto/poltrona-executiva-walnut` | 174 | 48 | 229 | 1509 | 0 (0,00%) |

## Limites violados

- p99 1129 ms > 1000 ms
- p95 degradation 7.49x > 2x
