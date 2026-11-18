# Relatório do teste de carga (RNF02)

- **Data:** 2026-11-18T01:19:24.321Z
- **Servidor:** https://localhost
- **Premissa de tráfego médio:** 10 usuários simultâneos, pausa média de 1000 ms entre páginas (premissa a validar)
- **Carga:** 3x (30 usuários simultâneos), 60 s por fase
- **Resultado:** aprovado

## Fases

| Fase | Usuários | Requisições | Req/s | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|---|---|
| Tráfego médio (1x) | 10 | 579 | 9,7 | 33 | 83 | 130 | 0 (0,00%) |
| Carga (3x) | 30 | 1689 | 28,2 | 42 | 107 | 165 | 0 (0,00%) |

## Limites

| Limite | Valor | Medido na carga |
|---|---|---|
| p95 | até 500 ms | 107 ms |
| p99 | até 1000 ms | 165 ms |
| Taxa de erro | até 1,00% | 0,00% |
| Degradação do p95 (carga / tráfego médio) | até 2x | 1,29x |

## Carga por rota

| Rota | Requisições | p50 (ms) | p95 (ms) | p99 (ms) | Erros |
|---|---|---|---|---|---|
| `/` | 518 | 37 | 90 | 137 | 0 (0,00%) |
| `/busca?q=caneta` | 158 | 43 | 105 | 157 | 0 (0,00%) |
| `/busca?q=mesa` | 164 | 43 | 126 | 180 | 0 (0,00%) |
| `/categoria/escrita-fina` | 251 | 44 | 117 | 171 | 0 (0,00%) |
| `/categoria/mobiliario-ergonomico` | 187 | 43 | 123 | 138 | 0 (0,00%) |
| `/produto/caneta-tinteiro-heritage` | 236 | 46 | 103 | 207 | 0 (0,00%) |
| `/produto/poltrona-executiva-walnut` | 175 | 46 | 144 | 187 | 0 (0,00%) |
