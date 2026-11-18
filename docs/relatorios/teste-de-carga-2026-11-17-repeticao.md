# Relatório do teste de carga (RNF02)

- **Data:** 2026-11-17T23:53:19.028Z
- **Servidor:** https://localhost
- **Premissa de tráfego médio:** 10 usuários simultâneos, pausa média de 1000 ms entre páginas (premissa a validar)
- **Carga:** 3x (30 usuários simultâneos), 60 s por fase
- **Resultado:** reprovado

## Fases

| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|---|---|
| Tráfego médio (1x) | 10 | 576 | 9,6 | 26 | 63 | 102 | 0 (0,00%) |
| Carga (3x) | 30 | 1544 | 25,7 | 65 | 866 | 1449 | 0 (0,00%) |

## Limites

| Limite | Valor | Medido na carga |
|---|---|---|
| p95 | até 500 ms | 866 ms |
| p99 | até 1000 ms | 1449 ms |
| Taxa de erro | até 1,00% | 0,00% |
| Degradação do p95 (carga / tráfego médio) | até 2x | 13,75x |

## Carga por rota

| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|
| `/` | 467 | 59 | 842 | 1340 | 0 (0,00%) |
| `/busca?q=caneta` | 158 | 67 | 942 | 1310 | 0 (0,00%) |
| `/busca?q=mesa` | 166 | 62 | 866 | 1380 | 0 (0,00%) |
| `/categoria/escrita-fina` | 218 | 63 | 1185 | 1524 | 0 (0,00%) |
| `/categoria/mobiliario-ergonomico` | 132 | 60 | 707 | 1338 | 0 (0,00%) |
| `/produto/caneta-tinteiro-heritage` | 257 | 79 | 757 | 1499 | 0 (0,00%) |
| `/produto/poltrona-executiva-walnut` | 146 | 68 | 914 | 1649 | 0 (0,00%) |

## Limites violados

- p95 866 ms > 500 ms
- p99 1449 ms > 1000 ms
- p95 degradation 13.75x > 2x
