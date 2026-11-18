# Auditoria de 18/11/2026

Relatórios da auditoria feita em 18/11/2026, em modo somente leitura, sobre a branch `perf/217-build-optimizations` (commit `2569c19`, a `develop` com as otimizações do PR #218) e o servidor local Docker.

**Escopo:** arquitetura, documentação contra o código e os requisitos (RF, RN e RNF), segurança (OWASP, ASVS e os requisitos do projeto), qualidade e funcionalidade, e atualizações de dependências. Os relatórios citam só nomes de variáveis de ambiente, nunca valores de segredo.

## Relatórios

| Relatório | Conteúdo |
|---|---|
| [Mapa arquitetural](mapa-arquitetural.md) | Visão geral da arquitetura, com o arquivo de origem de cada afirmação |
| [Auditoria de documentação](auditoria-documentacao.md) | Matriz de rastreabilidade dos 98 requisitos e documentação desatualizada |
| [Auditoria de segurança](auditoria-seguranca.md) | Achados de segurança (SEC, SUS), com cenário, correção e teste de validação |
| [Auditoria de qualidade](auditoria-qualidade.md) | Qualidade do código, funcionalidade e cobertura de testes |
| [Atualizações tecnológicas](atualizacoes-tecnologicas.md) | Dependências desatualizadas e recomendações de atualização |

## Issues e PRs gerados

| Issue | PR | Assunto |
|---|---|---|
| #217 | #218 | Tempo de build e tamanho da imagem |
| #220 | — | Sessão, segredos do app e limites de requisição |
| #221 | #224 | TLS obrigatório nas conexões com o MySQL |
| #222 | — | Testes de integração de estorno, faturado e crédito |
| #223 | — | Publicação destes relatórios e correção da documentação desatualizada |
