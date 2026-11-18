# Relatório do teste de carga (RNF02)

- **Data:** 2026-11-17T23:34:17.116Z
- **Servidor:** https://localhost
- **Premissa de tráfego médio:** 10 usuários simultâneos, pausa média de 1000 ms entre páginas (premissa a validar)
- **Carga:** 3x (30 usuários simultâneos), 60 s por fase
- **Resultado:** reprovado

## Fases

| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|---|---|
| Tráfego médio (1x) | 10 | 571 | 9,5 | 31 | 107 | 279 | 0 (0,00%) |
| Carga (3x) | 30 | 1582 | 26,4 | 48 | 699 | 1405 | 0 (0,00%) |

## Limites

| Limite | Valor | Medido na carga |
|---|---|---|
| p95 | até 500 ms | 699 ms |
| p99 | até 1000 ms | 1405 ms |
| Taxa de erro | até 1,00% | 0,00% |
| Degradação do p95 (carga / tráfego médio) | até 2x | 6,53x |

## Carga por rota

| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|
| `/` | 462 | 45 | 668 | 1236 | 0 (0,00%) |
| `/busca?q=caneta` | 164 | 46 | 435 | 825 | 0 (0,00%) |
| `/busca?q=mesa` | 153 | 47 | 573 | 1618 | 0 (0,00%) |
| `/categoria/escrita-fina` | 229 | 45 | 736 | 1591 | 0 (0,00%) |
| `/categoria/mobiliario-ergonomico` | 151 | 44 | 624 | 1195 | 0 (0,00%) |
| `/produto/caneta-tinteiro-heritage` | 259 | 54 | 732 | 1330 | 0 (0,00%) |
| `/produto/poltrona-executiva-walnut` | 164 | 62 | 1070 | 1665 | 0 (0,00%) |

## Limites violados

- p95 699 ms > 500 ms
- p99 1405 ms > 1000 ms
- p95 degradation 6.53x > 2x
