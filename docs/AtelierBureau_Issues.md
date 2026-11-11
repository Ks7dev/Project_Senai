# Atelier Bureau — Issues do Projeto

Repositório: `Ks7dev/Project_Senai` · Base: Levantamento de Requisitos v2.0 · Padrão: [`ARCHITECTURE.md`](../ARCHITECTURE.md), seção 7

Total: 82 issues (`AB-001` = #1 … `AB-082` = #82). Os códigos entre parênteses (RF, RN, RNF) referenciam o documento de requisitos.

## Como usar

- Cada issue tem **um** label `tipo: *`, **um** `área: *` e os labels de preocupação que couberem. Não há épicos nem sub-issues.
- **Milestone = versão** em que o escopo sai, com um dia de prazo cada. A entrega final, com o projeto rodando, é em **14/11/2026**.
- **Prioridade, esforço, etapa e status** são campos do GitHub Project [Atelier Bureau](https://github.com/users/Ks7dev/projects/1), não labels. O Status espelha as listas do Trello.
- O ID `AB-xxx` vai no início do título e é igual ao número da issue, para cruzar com os cards do Trello.
- Branch por issue: `<type>/<issue>-<slug>` a partir da `develop`. Os commits levam `Closes #N` ou `Refs #N`, e a issue fecha quando a release chega na `master`.
- Os épicos antigos (#83–#94) foram fechados como *not planned* ao adotar o padrão de issues independentes.
- Alterações de escopo são feitas na issue do GitHub e refletidas neste arquivo.

## Labels

| Label | Uso |
|---|---|
| `tipo: bug` | Comportamento errado |
| `tipo: feature` | Funcionalidade nova |
| `tipo: refactor` | Muda estrutura sem mudar comportamento |
| `tipo: task` | Configuração, infra, docs, design ou decisão |
| `área: acesso` | Cadastro, login, contas PJ, perfis e usuários internos |
| `área: app` | Shell, layout, design system, decisões, infra e release |
| `área: back office` | Promoções, páginas institucionais, LGPD e auditoria |
| `área: carrinho e cotação` | Carrinho, cotação, aprovação e preços B2B |
| `área: catálogo` | Produtos, categorias, busca, PDP e home |
| `área: financeiro` | Faturado, crédito corporativo, estornos e NF-e |
| `área: frete` | Endereço, CEP e modalidades de frete |
| `área: pagamento` | Checkout e Mercado Pago |
| `área: pedidos` | Estoque, ciclo do pedido, rastreio e e-mails |
| `área: pós-venda` | Garantia, trocas, vendedor dedicado e demonstrações |
| `accessibility` | Barrier affecting people with disabilities |
| `banco` | Exige migration Prisma (MySQL) e revisão do schema |
| `documentação` | Documentação e exemplos de configuração |
| `escopo a validar` | Depende de validação antes de começar |
| `infra` | CI, deploy e ambiente |
| `observabilidade` | Logs, erros e monitoramento |
| `performance` | Ganho de desempenho |
| `segurança` | Exige atenção redobrada na revisão |
| `testes` | Suíte de testes automatizados |

## Milestones

| Milestone | Escopo | Dia | Entrega |
|---|---|---|---|
| v0.1.0 | Etapa 0 — Planejamento e Decisões + Etapa 1 — Fundação Técnica e Design System | 1 | 10/11/2026 |
| v0.2.0 | Etapa 2 — Catálogo e Conta | 2 | 11/11/2026 |
| v0.3.0 | Etapa 3 — Carrinho, Frete e Checkout | 3 | 12/11/2026 |
| v0.4.0 | Etapa 4 — Fluxo B2B + Etapa 5 — Pós-venda e Back Office | 4 | 13/11/2026 |
| v1.0.0 | Etapa 6 — Qualidade, Segurança e Lançamento (entrega final, projeto rodando) | 5 | 14/11/2026 |

## GitHub Project

[Atelier Bureau](https://github.com/users/Ks7dev/projects/1), vinculado ao repositório, com os campos:

| Campo | Valores |
|---|---|
| Status | Backlog, Bloqueado, Em andamento, Em revisão, Em teste, Em validação, Concluído |
| Prioridade | P0 (essencial para o MVP), P1 (importante), P2 (desejável) |
| Esforço | P, M, G (definido no refinamento) |
| Etapa | E0–E6 |

## Decisões registradas

| Issue | Decisão |
|---|---|
| #1 | Stack, estrutura e fluxo de trabalho definidos em `ARCHITECTURE.md`. |
| #3 | Ícones: **Lucide** (`lucide-react`). O mapeamento dos ícones do protótipo foi movido para a #18. |
| #5 | Valores do documento v2 confirmados: R$ 10.000 (RN01), R$ 5.000 (RN06), Pix 30 min e boleto 3 dias úteis (RN14), RMSP (RN16), limites dos Correios (RN20). O seed foi movido para a #8. |
| #2, #4 | Em formalização pelo responsável (status Em andamento). |

## Resumo

| Issue | Título | Tipo | Área | Milestone | Etapa | Prioridade | Status |
|---|---|---|---|---|---|---|---|
| #1 AB-001 | Definir stack e estrutura de pastas com base nos repositórios CRM e Core | task | app | v0.1.0 | E0 | P0 | Backlog |
| #2 AB-002 | Validar o nome Atelier Bureau (INPI e domínio) | task | app | v0.1.0 | E0 | P1 | Em andamento |
| #3 AB-003 | Escolher a biblioteca oficial de ícones | task | app | v0.1.0 | E0 | P1 | Concluído |
| #4 AB-004 | Validação jurídica das políticas de troca, arrependimento e garantia | task | app | v0.1.0 | E0 | P1 | Em andamento |
| #5 AB-005 | Confirmar os valores configuráveis das regras de negócio | task | app | v0.1.0 | E0 | P1 | Concluído |
| #6 AB-006 | Setup do repositório: estrutura MVC, lint, formatter e templates | task | app | v0.1.0 | E1 | P0 | Backlog |
| #7 AB-007 | Configurar ambientes e variáveis (dev, homologação, produção) | task | app | v0.1.0 | E1 | P0 | Backlog |
| #8 AB-008 | Modelagem do banco de dados e migrations iniciais | feature | app | v0.1.0 | E1 | P0 | Backlog |
| #9 AB-009 | Pipeline de CI com lint, testes e build | task | app | v0.1.0 | E1 | P0 | Backlog |
| #10 AB-010 | Padrão de tratamento de erros, logs e rate limiting | task | app | v0.1.0 | E1 | P0 | Backlog |
| #11 AB-011 | HTTPS obrigatório e headers de segurança | task | app | v0.1.0 | E1 | P0 | Backlog |
| #12 AB-012 | Padrão de documentação de código | task | app | v0.1.0 | E1 | P1 | Backlog |
| #13 AB-013 | Criar os tokens do design system Warm Editorial Atelier | task | app | v0.1.0 | E1 | P0 | Backlog |
| #14 AB-014 | Redesenhar o logo e criar o kit de marca | task | app | v0.1.0 | E1 | P1 | Backlog |
| #15 AB-015 | Componentes base da biblioteca de UI | feature | app | v0.1.0 | E1 | P0 | Backlog |
| #16 AB-016 | Componentes de commerce | feature | app | v0.2.0 | E2 | P1 | Backlog |
| #17 AB-017 | Layout base: header, footer e grid responsivo | feature | app | v0.1.0 | E1 | P0 | Backlog |
| #18 AB-018 | Corrigir as divergências do protótipo Stitch | task | app | v0.1.0 | E0 | P1 | Backlog |
| #19 AB-019 | Prototipar as telas faltantes | task | app | v0.1.0 | E1 | P1 | Backlog |
| #20 AB-020 | Auditoria de acessibilidade WCAG 2.1 AA | task | app | v1.0.0 | E6 | P1 | Backlog |
| #21 AB-021 | Cadastro de produtos no back office | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #22 AB-022 | Upload de imagens com conversão para WebP | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #23 AB-023 | Categorias, subcategorias e navegação | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #24 AB-024 | Listagem de produtos (PLP) com filtros avançados | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #25 AB-025 | Busca de produtos | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #26 AB-026 | Página de produto (PDP) | feature | catálogo | v0.2.0 | E2 | P0 | Backlog |
| #27 AB-027 | Comparador de até 4 produtos | feature | catálogo | v0.2.0 | E2 | P2 | Backlog |
| #28 AB-028 | Inativação de produtos sem perda de histórico | feature | catálogo | v0.2.0 | E2 | P1 | Backlog |
| #29 AB-029 | Importação de produtos via CSV | feature | catálogo | v0.2.0 | E2 | P1 | Backlog |
| #30 AB-030 | Home editorial com carrossel editável | feature | catálogo | v0.2.0 | E2 | P1 | Backlog |
| #31 AB-031 | SEO técnico | task | catálogo | v1.0.0 | E6 | P1 | Backlog |
| #32 AB-032 | Cadastro e login de PF e PJ | feature | acesso | v0.2.0 | E2 | P0 | Backlog |
| #33 AB-033 | Recuperação de senha e 2FA opcional | feature | acesso | v0.2.0 | E2 | P0 | Backlog |
| #34 AB-034 | Conta corporativa multiusuário com consulta de CNPJ | feature | acesso | v0.2.0 | E2 | P0 | Backlog |
| #35 AB-035 | Perfis de acesso da conta corporativa | feature | acesso | v0.2.0 | E2 | P0 | Backlog |
| #36 AB-036 | Múltiplos endereços por conta | feature | acesso | v0.2.0 | E2 | P1 | Backlog |
| #37 AB-037 | Área do cliente | feature | acesso | v0.2.0 | E2 | P1 | Backlog |
| #38 AB-038 | Lista de favoritos | feature | acesso | v0.2.0 | E2 | P2 | Backlog |
| #39 AB-039 | Consulta de endereço via ViaCEP com fallback | feature | frete | v0.3.0 | E3 | P0 | Backlog |
| #40 AB-040 | Módulo de frete com estratégias por modalidade | feature | frete | v0.3.0 | E3 | P0 | Backlog |
| #41 AB-041 | Integração com a API dos Correios | feature | frete | v0.3.0 | E3 | P0 | Backlog |
| #42 AB-042 | Integração com agregador de transportadoras | feature | frete | v0.3.0 | E3 | P1 | Backlog |
| #43 AB-043 | Entrega própria com montagem por faixa de CEP | feature | frete | v0.3.0 | E3 | P1 | Backlog |
| #44 AB-044 | Cotação manual de frete como contingência | feature | frete | v0.3.0 | E3 | P1 | Backlog |
| #45 AB-045 | Recotação de frete ao alterar endereço | feature | frete | v0.3.0 | E3 | P2 | Backlog |
| #46 AB-046 | Carrinho e lista de projeto salva | feature | carrinho e cotação | v0.3.0 | E3 | P0 | Backlog |
| #47 AB-047 | Personalização e serviços adicionais no carrinho | feature | carrinho e cotação | v0.3.0 | E3 | P1 | Backlog |
| #48 AB-048 | Solicitação de cotação com anexos | feature | carrinho e cotação | v0.4.0 | E4 | P0 | Backlog |
| #49 AB-049 | Número de cotação rastreável e validade | feature | carrinho e cotação | v0.4.0 | E4 | P0 | Backlog |
| #50 AB-050 | Back office comercial de cotações | feature | carrinho e cotação | v0.4.0 | E4 | P0 | Backlog |
| #51 AB-051 | Fluxo de aprovação de pedidos | feature | carrinho e cotação | v0.4.0 | E4 | P0 | Backlog |
| #52 AB-052 | Tabela de preços por cliente e desconto por volume | feature | carrinho e cotação | v0.4.0 | E4 | P1 | Backlog |
| #53 AB-053 | Agendamento de entrega e instalação | feature | carrinho e cotação | v0.3.0 | E3 | P1 | Backlog |
| #54 AB-054 | Integração do Payment Brick do Mercado Pago | feature | pagamento | v0.3.0 | E3 | P0 | Backlog |
| #55 AB-055 | Pix e boleto via Mercado Pago com expiração | feature | pagamento | v0.3.0 | E3 | P0 | Backlog |
| #56 AB-056 | Parcelamento configurável | feature | pagamento | v0.3.0 | E3 | P1 | Backlog |
| #57 AB-057 | Webhook do Mercado Pago | feature | pagamento | v0.3.0 | E3 | P0 | Backlog |
| #58 AB-058 | Status de pagamento e payment_id | feature | pagamento | v0.3.0 | E3 | P0 | Backlog |
| #59 AB-059 | Estornos total e parcial | feature | financeiro | v0.4.0 | E5 | P1 | Backlog |
| #60 AB-060 | Fluxo de pagamento faturado 28/56 dias | feature | financeiro | v0.4.0 | E4 | P0 | Backlog |
| #61 AB-061 | Aprovação de crédito corporativo | feature | financeiro | v0.4.0 | E4 | P0 | Backlog |
| #62 AB-062 | Checklist PCI-DSS SAQ A | task | pagamento | v1.0.0 | E6 | P1 | Backlog |
| #63 AB-063 | Emissão de NF-e via API | feature | financeiro | v0.4.0 | E5 | P1 | Backlog |
| #64 AB-064 | Reserva, baixa e liberação de estoque | feature | pedidos | v0.3.0 | E3 | P0 | Backlog |
| #65 AB-065 | Ciclo de vida do pedido | feature | pedidos | v0.3.0 | E3 | P0 | Backlog |
| #66 AB-066 | Rastreamento do pedido | feature | pedidos | v0.3.0 | E3 | P1 | Backlog |
| #67 AB-067 | E-mails transacionais | feature | pedidos | v0.3.0 | E3 | P1 | Backlog |
| #68 AB-068 | Chamados de garantia e assistência técnica | feature | pós-venda | v0.4.0 | E5 | P1 | Backlog |
| #69 AB-069 | Canal com vendedor dedicado (WhatsApp) | feature | pós-venda | v0.4.0 | E5 | P1 | Backlog |
| #70 AB-070 | Agendamento de demonstração | feature | pós-venda | v0.4.0 | E5 | P2 | Backlog |
| #71 AB-071 | Fluxo de troca, devolução e arrependimento | feature | pós-venda | v0.4.0 | E5 | P1 | Backlog |
| #72 AB-072 | Usuários internos e permissões | feature | acesso | v0.2.0 | E2 | P0 | Backlog |
| #73 AB-073 | Promoções, cupons e frete cortesia | feature | back office | v0.4.0 | E5 | P1 | Backlog |
| #74 AB-074 | Páginas institucionais editáveis | feature | back office | v0.4.0 | E5 | P1 | Backlog |
| #75 AB-075 | LGPD: consentimento e direitos do titular | task | back office | v0.4.0 | E5 | P0 | Backlog |
| #76 AB-076 | Log de auditoria de ações sensíveis | task | back office | v0.4.0 | E5 | P1 | Backlog |
| #77 AB-077 | Testes automatizados e cobertura mínima | task | app | v1.0.0 | E6 | P0 | Backlog |
| #78 AB-078 | Orçamento de performance | task | app | v1.0.0 | E6 | P1 | Backlog |
| #79 AB-079 | Teste de carga | task | app | v1.0.0 | E6 | P2 | Backlog |
| #80 AB-080 | Monitoramento de disponibilidade e alertas | task | app | v1.0.0 | E6 | P1 | Backlog |
| #81 AB-081 | Backup e teste de restauração | task | app | v1.0.0 | E6 | P1 | Backlog |
| #82 AB-082 | Deploy e checklist de lançamento | task | app | v1.0.0 | E6 | P0 | Backlog |

---

# Issues

## App

### AB-001 — Definir stack e estrutura de pastas com base nos repositórios CRM e Core

**Issue:** #1  
**Labels:** `tipo: task`, `área: app`, `documentação`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF07

**Descrição**

Levantar linguagem, framework, ORM, padrão de pastas, convenções de commit e de issues usados no CRM e no Core e registrar como padrão do projeto.

**Critérios de aceite**

- [ ] Documento ARCHITECTURE.md no repositório com stack e justificativa
- [ ] Estrutura de pastas MVC definida por módulo
- [ ] Convenção de branches e commits definida

### AB-002 — Validar o nome Atelier Bureau (INPI e domínio)

**Issue:** #2  
**Labels:** `tipo: task`, `área: app`, `escopo a validar`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P1 · **Status inicial:** Em andamento  
**Referências:** Seção 1.1

**Descrição**

Pesquisar o nome na base do INPI (classe 35) e a disponibilidade do domínio .com.br.

**Critérios de aceite**

- [ ] Resultado da busca no INPI registrado
- [ ] Domínio verificado
- [ ] Nome confirmado ou alternativa aprovada

### AB-003 — Escolher a biblioteca oficial de ícones

**Issue:** #3 (fechada)  
**Labels:** `tipo: task`, `área: app`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P1 · **Status inicial:** Concluído  
**Referências:** RNF15

**Descrição**

Decidir entre Lucide, Phosphor (light) ou Material Symbols para manter coerência com o tom editorial.

**Critérios de aceite**

- [x] Biblioteca escolhida: Lucide (`lucide-react`)
- [x] ~~Ícones do protótipo mapeados~~ movido para a #18

### AB-004 — Validação jurídica das políticas de troca, arrependimento e garantia

**Issue:** #4  
**Labels:** `tipo: task`, `área: app`, `escopo a validar`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P1 · **Status inicial:** Em andamento  
**Referências:** RN06, RN12, RN22

**Descrição**

Validar o tratamento de itens personalizados para PF, a redação da garantia estendida e os termos de uso.

**Critérios de aceite**

- [ ] Política de trocas e devoluções aprovada
- [ ] Texto da garantia estendida aprovado
- [ ] Termos de uso e política de privacidade aprovados

### AB-005 — Confirmar os valores configuráveis das regras de negócio

**Issue:** #5 (fechada)  
**Labels:** `tipo: task`, `área: app`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P1 · **Status inicial:** Concluído  
**Referências:** RN01, RN06, RN14, RN16, RN20

**Descrição**

Validar com os stakeholders os valores iniciais: aprovação acima de R$ 10.000, garantia acima de R$ 5.000, expiração de Pix/boleto, faixas de CEP da cobertura e limites de frete.

**Critérios de aceite**

- [x] Valores confirmados e registrados no documento de requisitos
- [x] ~~Valores carregados como seed de configuração~~ movido para a #8

### AB-006 — Setup do repositório: estrutura MVC, lint, formatter e templates

**Issue:** #6  
**Labels:** `tipo: task`, `área: app`, `infra`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF07, RNF08

**Descrição**

Criar a estrutura inicial seguindo o padrão definido no AB-001, com lint, formatter, README e templates de issue e pull request.

**Critérios de aceite**

- [ ] Projeto roda localmente com um comando documentado
- [ ] Lint e formatter configurados e passando
- [ ] Templates de issue e PR criados em .github/

### AB-007 — Configurar ambientes e variáveis (dev, homologação, produção)

**Issue:** #7  
**Labels:** `tipo: task`, `área: app`, `segurança`, `infra`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF05, RNF16

**Descrição**

Separar configurações por ambiente (dev e servidor local) e garantir que segredos (chaves Mercado Pago, NF-e, transportadoras, senhas do MySQL) nunca fiquem no código. O servidor roda em Docker na máquina local (`ARCHITECTURE.md`, seção 5.1).

**Critérios de aceite**

- [ ] Arquivo .env.example documentado
- [ ] Segredos fora do repositório
- [ ] Credenciais de sandbox usadas em dev e homologação
- [ ] `docker-compose.yml` com `app`, `db` (MySQL 8, `utf8mb4`), `proxy` (Caddy) e `backup`, subindo com um único `docker compose up -d`
- [ ] `.env.example` com `DATABASE_URL` e demais chaves; usuário de banco da aplicação sem permissão de DDL

### AB-008 — Modelagem do banco de dados e migrations iniciais

**Issue:** #8  
**Labels:** `tipo: feature`, `área: app`, `banco`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF41, RF09, RF54, RNF16

**Descrição**

Modelar no `prisma/schema.prisma` (MySQL 8, InnoDB, `utf8mb4`) as entidades principais: usuário, conta corporativa, perfil, endereço, produto, SKU, categoria, carrinho, cotação, pedido, pagamento, frete, estoque e configuração. Seguir a seção 5 do `ARCHITECTURE.md`.

**Critérios de aceite**

- [ ] Diagrama ER no repositório
- [ ] Migrations criam todas as tabelas
- [ ] Seeds de desenvolvimento com produtos e contas de teste
- [ ] Valores das regras de negócio confirmados na #5 carregados como seed de configuração
- [ ] Schema Prisma com `provider = "mysql"`, FKs, `UNIQUE` (CPF, CNPJ, e-mail, SKU, `payment_id`) e índices de filtro/busca (incluindo `FULLTEXT`)
- [ ] Valores monetários em `DECIMAL(12,2)` e datas em UTC
- [ ] `npx prisma migrate dev` e `npx prisma db seed` rodam do zero no MySQL do Docker

### AB-009 — Pipeline de CI com lint, testes e build

**Issue:** #9  
**Labels:** `tipo: task`, `área: app`, `infra`, `testes`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF07

**Descrição**

Criar pipeline que roda a cada pull request.

**Critérios de aceite**

- [ ] Pipeline executa lint, testes e build
- [ ] PR bloqueado quando o pipeline falha

### AB-010 — Padrão de tratamento de erros, logs e rate limiting

**Issue:** #10  
**Labels:** `tipo: task`, `área: app`, `segurança`, `observabilidade`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF05

**Descrição**

Middleware global de erros sem vazamento de stack trace, logs estruturados e limite de requisições nas rotas públicas e de autenticação.

**Critérios de aceite**

- [ ] Respostas de erro padronizadas sem detalhes internos
- [ ] Rate limiting ativo em login, cadastro e APIs públicas
- [ ] Logs estruturados com identificador de requisição

### AB-011 — HTTPS obrigatório e headers de segurança

**Issue:** #11  
**Labels:** `tipo: task`, `área: app`, `segurança`, `infra`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF06, RNF16

**Descrição**

Forçar HTTPS sem fallback e configurar HSTS, CSP e demais headers de segurança.

**Critérios de aceite**

- [ ] Requisições HTTP redirecionadas ou recusadas
- [ ] HSTS e CSP configurados
- [ ] Verificação em ferramenta de análise de headers sem alertas críticos
- [ ] Caddy com `tls internal` na frente do app; certificado raiz exportado e instalável nos dispositivos da rede
- [ ] Porta 80 só redireciona para 443

### AB-012 — Padrão de documentação de código

**Issue:** #12  
**Labels:** `tipo: task`, `área: app`, `documentação`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF08

**Descrição**

Definir o padrão JSDoc/docstrings e a geração de documentação por módulo.

**Critérios de aceite**

- [ ] Guia de documentação no repositório
- [ ] Lint acusa função pública sem documentação

### AB-013 — Criar os tokens do design system Warm Editorial Atelier

**Issue:** #13  
**Labels:** `tipo: task`, `área: app`, `accessibility`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF13, RNF15

**Descrição**

Arquivo único de tokens com a paleta aprovada (terracota ajustada para #7A5C4C, texto terciário só em desabilitados), tipografia Playfair Display + Plus Jakarta Sans, espaçamentos, raios e sombras.

**Critérios de aceite**

- [ ] Arquivo único de tokens versionado
- [ ] Todas as combinações de texto com contraste de pelo menos 4,5:1
- [ ] Paleta Material duplicada e Space Grotesk removidas

### AB-014 — Redesenhar o logo e criar o kit de marca

**Issue:** #14  
**Labels:** `tipo: task`, `área: app`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** Seção 7

**Descrição**

Novo símbolo sem leitura de botão “+” ou de farmácia, texto convertido em curvas e versões de uso.

**Critérios de aceite**

- [ ] Versões horizontal, monograma, negativo e monocromática em SVG
- [ ] Favicons 32, 180 e 512 px
- [ ] Logo legível em 24 px de altura

### AB-015 — Componentes base da biblioteca de UI

**Issue:** #15  
**Labels:** `tipo: feature`, `área: app`, `accessibility`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF09, RNF13

**Descrição**

Botões (primário, ghost, texto editorial), inputs, select, checkbox, radio, chips, badges, tooltip e modal.

**Critérios de aceite**

- [ ] Componentes usam apenas tokens
- [ ] Estados hover, foco, desabilitado e erro
- [ ] Navegáveis por teclado com foco visível

### AB-016 — Componentes de commerce

**Issue:** #16  
**Labels:** `tipo: feature`, `área: app`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF09

**Descrição**

Card de produto, swatches de material, accordion de especificações, drawer de carrinho e resumo de pedido.

**Critérios de aceite**

- [ ] Componentes reutilizados na PLP, PDP e carrinho
- [ ] Comportamento responsivo nos três breakpoints

### AB-017 — Layout base: header, footer e grid responsivo

**Issue:** #17  
**Labels:** `tipo: feature`, `área: app`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF15

**Descrição**

Grid de 12/8/4 colunas, max-width de 1440 px, header com busca, menu e carrinho, e footer institucional.

**Critérios de aceite**

- [ ] Breakpoints mobile, tablet e desktop funcionando
- [ ] Menu mobile acessível
- [ ] Footer com links das páginas institucionais

### AB-018 — Corrigir as divergências do protótipo Stitch

**Issue:** #18  
**Labels:** `tipo: task`, `área: app`, `escopo a validar`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 0 — Planejamento e Decisões  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** Seção 7

**Descrição**

Ajustar prazo faturado para 28/56, remover frete cortesia fixo, marcar CNPJ como fictício, trocar placeholders do logo e unificar todas as telas no Warm Editorial Atelier.

**Critérios de aceite**

- [ ] Nenhuma tela usa Newsreader ou Space Grotesk
- [ ] Prazos e textos alinhados ao documento v2
- [ ] Ícones do protótipo mapeados para o Lucide (`lucide-react`), decisão da #3

### AB-019 — Prototipar as telas faltantes

**Issue:** #19  
**Labels:** `tipo: task`, `área: app`  
**Milestone:** v0.1.0 · **Etapa:** Etapa 1 — Fundação Técnica e Design System  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** Seção 7

**Descrição**

Login/cadastro, área do cliente, cotação, aprovação, checkout com Payment Brick, rastreamento, comparador e back office.

**Critérios de aceite**

- [ ] Telas desktop e mobile no Stitch
- [ ] Telas revisadas contra os requisitos correspondentes

### AB-020 — Auditoria de acessibilidade WCAG 2.1 AA

**Issue:** #20  
**Labels:** `tipo: task`, `área: app`, `accessibility`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF13

**Descrição**

Auditar as páginas principais com ferramenta automática e teste manual de teclado e leitor de tela.

**Critérios de aceite**

- [ ] Nenhum erro crítico na ferramenta automática
- [ ] Fluxo de compra completo navegável só por teclado
- [ ] Imagens de produto com texto alternativo

### AB-077 — Testes automatizados e cobertura mínima

**Issue:** #77  
**Labels:** `tipo: task`, `área: app`, `testes`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF07

**Descrição**

Testes unitários e de integração dos fluxos críticos (frete, estoque, pagamento, aprovação).

**Critérios de aceite**

- [ ] Cobertura mínima definida e verificada no CI
- [ ] Fluxo de compra coberto por teste de ponta a ponta

### AB-078 — Orçamento de performance

**Issue:** #78  
**Labels:** `tipo: task`, `área: app`, `performance`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF10

**Descrição**

Medir e otimizar LCP e tempo de resposta da API.

**Critérios de aceite**

- [ ] LCP de até 2,5 s nas páginas de vitrine
- [ ] API com p95 de até 500 ms

### AB-079 — Teste de carga

**Issue:** #79  
**Labels:** `tipo: task`, `área: app`, `performance`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P2 · **Status inicial:** Backlog  
**Referências:** RNF02

**Descrição**

Simular 3x o tráfego médio esperado.

**Critérios de aceite**

- [ ] Relatório do teste de carga
- [ ] Sem erros nem degradação acima do limite definido

### AB-080 — Monitoramento de disponibilidade e alertas

**Issue:** #80  
**Labels:** `tipo: task`, `área: app`, `infra`, `observabilidade`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF01, RNF16

**Descrição**

Monitorar uptime e erros, com alertas para a equipe.

**Critérios de aceite**

- [ ] Alerta disparado em queda
- [ ] Painel de disponibilidade
- [ ] Healthcheck e `restart: unless-stopped` em todos os containers

### AB-081 — Backup e teste de restauração

**Issue:** #81  
**Labels:** `tipo: task`, `área: app`, `infra`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF11, RNF16

**Descrição**

Backup diário com retenção de 30 dias e restauração testada.

**Critérios de aceite**

- [ ] Backup automático configurado
- [ ] Restauração testada e documentada dentro do RTO de 4 h
- [ ] Container `backup` com `mysqldump` diário em `./backups`, retenção de 30 dias e restauração documentada

### AB-082 — Deploy e checklist de lançamento

**Issue:** #82  
**Labels:** `tipo: task`, `área: app`, `infra`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF01, RNF06, RNF16

**Descrição**

Subir o servidor local em Docker (app, MySQL, Caddy e backup), acessível pelos dispositivos da rede, e executar o checklist final.

**Critérios de aceite**

- [ ] Site acessível via HTTPS por outro dispositivo da rede (IP fixo da máquina servidora)
- [ ] Checklist de lançamento concluído
- [ ] Apresentação final preparada
- [ ] `docker compose up -d` sobe o servidor local e `prisma migrate deploy` roda ao iniciar o app
- [ ] MySQL acessível pela rede só com usuário nomeado, restrito à sub-rede e com TLS; `root` sem acesso remoto
- [ ] Portas 80, 443 e 3306 liberadas no firewall só no perfil de rede Privada

## Catálogo

### AB-021 — Cadastro de produtos no back office

**Issue:** #21  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF41, RN06, RN09

**Descrição**

CRUD completo: nome, descrição, especificações, categoria, preço, imagens, peso/dimensões, certificações, garantia, edição limitada e numeração de lote.

**Critérios de aceite**

- [ ] Produto com certificação obrigatória não publica sem documento anexado
- [ ] Peso e dimensões obrigatórios
- [ ] Garantia estendida marcada automaticamente acima do valor configurado

### AB-022 — Upload de imagens com conversão para WebP

**Issue:** #22  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RNF04

**Descrição**

Aceitar JPG, PNG e WebP, converter para WebP no servidor com no máximo 300 KB e gerar versões responsivas.

**Critérios de aceite**

- [ ] Arquivos fora dos formatos aceitos são recusados com mensagem clara
- [ ] Imagem final em WebP com até 300 KB
- [ ] Versões em tamanhos diferentes geradas

### AB-023 — Categorias, subcategorias e navegação

**Issue:** #23  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF01

**Descrição**

Árvore de categorias gerenciável e menu de navegação.

**Critérios de aceite**

- [ ] Admin cria, edita e reordena categorias
- [ ] Menu reflete a árvore sem alteração de código

### AB-024 — Listagem de produtos (PLP) com filtros avançados

**Issue:** #24  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF02

**Descrição**

Filtros por marca, faixa de preço, material/acabamento, especificação técnica e prazo de entrega, com ordenação e paginação.

**Critérios de aceite**

- [ ] Filtros combináveis e refletidos na URL
- [ ] Contagem de resultados por filtro
- [ ] Estado vazio tratado

### AB-025 — Busca de produtos

**Issue:** #25  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF02

**Descrição**

Busca textual por nome, descrição e especificação, com sugestões.

**Critérios de aceite**

- [ ] Busca tolera acentos e caixa
- [ ] Produtos inativos não aparecem
- [ ] Página de resultados usa os mesmos filtros da PLP

### AB-026 — Página de produto (PDP)

**Issue:** #26  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF03, RF18

**Descrição**

Galeria, especificações, ficha técnica em PDF, garantia, certificações, prazo, botão de cotação e contato com o vendedor.

**Critérios de aceite**

- [ ] Ficha técnica em PDF disponível para download
- [ ] Sinalização de sob encomenda quando sem estoque
- [ ] Botões de comprar e de solicitar cotação

### AB-027 — Comparador de até 4 produtos

**Issue:** #27  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P2 · **Status inicial:** Backlog  
**Referências:** RF04

**Descrição**

Comparação lado a lado de especificações.

**Critérios de aceite**

- [ ] Limite de 4 produtos com aviso
- [ ] Especificações alinhadas por atributo
- [ ] Comparação mantida durante a navegação

### AB-028 — Inativação de produtos sem perda de histórico

**Issue:** #28  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF42

**Descrição**

Produto inativo sai da vitrine e da busca, mas permanece nos pedidos antigos.

**Critérios de aceite**

- [ ] Produto inativo some da vitrine e da busca
- [ ] Pedidos antigos continuam exibindo o produto

### AB-029 — Importação de produtos via CSV

**Issue:** #29  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF48, RNF04

**Descrição**

Importação em massa com validação e relatório de erros por linha.

**Critérios de aceite**

- [ ] Modelo de CSV para download
- [ ] Relatório de erros por linha
- [ ] Linhas válidas importadas mesmo com erros em outras

### AB-030 — Home editorial com carrossel editável

**Issue:** #30  
**Labels:** `tipo: feature`, `área: catálogo`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF47

**Descrição**

Home conforme o protótipo, com carrossel e vitrines configuráveis pelo admin.

**Critérios de aceite**

- [ ] Admin altera imagens, textos e produtos sem deploy
- [ ] Carrossel acessível (pausa e navegação por teclado)

### AB-031 — SEO técnico

**Issue:** #31  
**Labels:** `tipo: task`, `área: catálogo`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF14

**Descrição**

URLs amigáveis, sitemap, metadados por página e dados estruturados de produto.

**Critérios de aceite**

- [ ] Sitemap gerado automaticamente
- [ ] Title e description em todas as páginas públicas
- [ ] Schema Product validado sem erros

## Acesso

### AB-032 — Cadastro e login de PF e PJ

**Issue:** #32  
**Labels:** `tipo: feature`, `área: acesso`, `segurança`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF39

**Descrição**

Fluxos distintos para CPF e CNPJ com validação de documento.

**Critérios de aceite**

- [ ] Validação de CPF e CNPJ
- [ ] Dados obrigatórios distintos por tipo de conta
- [ ] Senha armazenada com hash seguro

### AB-033 — Recuperação de senha e 2FA opcional

**Issue:** #33  
**Labels:** `tipo: feature`, `área: acesso`, `segurança`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF40

**Descrição**

Recuperação por e-mail com token expirável e 2FA opcional para contas corporativas.

**Critérios de aceite**

- [ ] Token de recuperação expira e é de uso único
- [ ] 2FA ativável pela conta corporativa

### AB-034 — Conta corporativa multiusuário com consulta de CNPJ

**Issue:** #34  
**Labels:** `tipo: feature`, `área: acesso`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF09

**Descrição**

Consultar CNPJ via API (ex: BrasilAPI), preencher razão social e permitir convidar usuários.

**Critérios de aceite**

- [ ] CNPJ inativo bloqueia o cadastro
- [ ] Razão social preenchida automaticamente
- [ ] Convite de usuário por e-mail

### AB-035 — Perfis de acesso da conta corporativa

**Issue:** #35  
**Labels:** `tipo: feature`, `área: acesso`, `segurança`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF10, RN08

**Descrição**

Perfis solicitante, aprovador, financeiro e administrador da conta.

**Critérios de aceite**

- [ ] Conta multiusuário exige pelo menos um aprovador
- [ ] Conta de usuário único acumula administrador e aprovador
- [ ] Permissões aplicadas no backend

### AB-036 — Múltiplos endereços por conta

**Issue:** #36  
**Labels:** `tipo: feature`, `área: acesso`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF26

**Descrição**

Cadastro de matriz, filiais e obras como endereços de entrega.

**Critérios de aceite**

- [ ] CRUD de endereços com apelido
- [ ] Endereço padrão definido

### AB-037 — Área do cliente

**Issue:** #37  
**Labels:** `tipo: feature`, `área: acesso`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF31, RF15

**Descrição**

Painel com pedidos, cotações, dados, endereços, usuários (PJ) e favoritos.

**Critérios de aceite**

- [ ] Lista de pedidos com status
- [ ] Acesso de acordo com o perfil do usuário

### AB-038 — Lista de favoritos

**Issue:** #38  
**Labels:** `tipo: feature`, `área: acesso`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P2 · **Status inicial:** Backlog  
**Referências:** RF45

**Descrição**

Cliente logado adiciona e remove produtos dos favoritos.

**Critérios de aceite**

- [ ] Favoritos persistem entre sessões
- [ ] Ação disponível no card e na PDP

### AB-072 — Usuários internos e permissões

**Issue:** #72  
**Labels:** `tipo: feature`, `área: acesso`, `segurança`  
**Milestone:** v0.2.0 · **Etapa:** Etapa 2 — Catálogo e Conta  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF55

**Descrição**

Perfis administrador, comercial, financeiro e estoque com permissões por módulo.

**Critérios de aceite**

- [ ] Cada perfil acessa só os seus módulos
- [ ] Permissões verificadas no backend

## Frete

### AB-039 — Consulta de endereço via ViaCEP com fallback

**Issue:** #39  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF22, RF23, RF24, RF38, RN21

**Descrição**

Preenchimento automático a partir do CEP, com validação e digitação manual em caso de falha.

**Critérios de aceite**

- [ ] CEP validado com 8 dígitos antes da consulta
- [ ] Timeout libera digitação manual
- [ ] Checkout nunca bloqueia por falha do ViaCEP

### AB-040 — Módulo de frete com estratégias por modalidade

**Issue:** #40  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF25, RN20

**Descrição**

Serviço que escolhe Correios, transportadora ou entrega própria conforme peso, dimensões e CEP.

**Critérios de aceite**

- [ ] Regra da RN20 aplicada e coberta por testes
- [ ] Novas modalidades adicionáveis sem alterar o checkout

### AB-041 — Integração com a API dos Correios

**Issue:** #41  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF25

**Descrição**

Cálculo de PAC e SEDEX para volumes dentro dos limites.

**Critérios de aceite**

- [ ] Volume fora dos limites não é cotado nos Correios
- [ ] Erro da API cai no fallback

### AB-042 — Integração com agregador de transportadoras

**Issue:** #42  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF49

**Descrição**

Cotação de frete para volumes grandes via agregador (ex: Melhor Envio) em sandbox.

**Critérios de aceite**

- [ ] Exibe transportadora, prazo e valor
- [ ] Erro da API cai no fallback

### AB-043 — Entrega própria com montagem por faixa de CEP

**Issue:** #43  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF27, RF50, RN16

**Descrição**

Tabela de faixas de CEP e peso configurável no back office.

**Critérios de aceite**

- [ ] Admin edita faixas e valores
- [ ] Indicação de cobertura exibida no checkout

### AB-044 — Cotação manual de frete como contingência

**Issue:** #44  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RN16, RN20

**Descrição**

Encaminhar ao comercial pedidos sem frete calculável.

**Critérios de aceite**

- [ ] Pedido segue para a fila do comercial
- [ ] Cliente é avisado do prazo de retorno

### AB-045 — Recotação de frete ao alterar endereço

**Issue:** #45  
**Labels:** `tipo: feature`, `área: frete`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P2 · **Status inicial:** Backlog  
**Referências:** RN15

**Descrição**

Mudança de endereço após o pedido exige nova cotação de frete e prazo.

**Critérios de aceite**

- [ ] Alteração gera nova cotação
- [ ] Cliente confirma a diferença antes de seguir

## Carrinho e cotação

### AB-046 — Carrinho e lista de projeto salva

**Issue:** #46  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF07

**Descrição**

Carrinho persistente e opção de salvar como lista/projeto.

**Critérios de aceite**

- [ ] Carrinho mantido após login
- [ ] Lista salva pode ser retomada e convertida em carrinho

### AB-047 — Personalização e serviços adicionais no carrinho

**Issue:** #47  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF51, RF52, RN24

**Descrição**

Gravação a laser com prévia, embalagem institucional e montagem.

**Critérios de aceite**

- [ ] Custo e prazo extra somados ao pedido
- [ ] Item personalizado não cancelável após início da produção

### AB-048 — Solicitação de cotação com anexos

**Issue:** #48  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF05, RF08

**Descrição**

Cotação de itens ou do carrinho inteiro com upload de arquivos.

**Critérios de aceite**

- [ ] Anexos com tipos e tamanho limitados
- [ ] Cliente acompanha a cotação na área do cliente

### AB-049 — Número de cotação rastreável e validade

**Issue:** #49  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF06, RN02

**Descrição**

Cotação com número único e validade de 15 dias.

**Critérios de aceite**

- [ ] Número único gerado
- [ ] Cotação vencida exige revalidação de preços

### AB-050 — Back office comercial de cotações

**Issue:** #50  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF20

**Descrição**

Comercial visualiza, responde e converte cotações em pedidos.

**Critérios de aceite**

- [ ] Fila de cotações com status
- [ ] Conversão em pedido mantém os valores negociados

### AB-051 — Fluxo de aprovação de pedidos

**Issue:** #51  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF11, RN01

**Descrição**

Pedidos acima do limite vão para o aprovador da conta.

**Critérios de aceite**

- [ ] Aprovador diferente do solicitante
- [ ] Aprovação ou recusa registrada com data, usuário e justificativa
- [ ] Aprovador avisado por e-mail

### AB-052 — Tabela de preços por cliente e desconto por volume

**Issue:** #52  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF21, RN04

**Descrição**

Preços diferenciados por cliente ou segmento e descontos automáticos por quantidade.

**Critérios de aceite**

- [ ] Preço exibido conforme a tabela do cliente logado
- [ ] Desconto por volume aplicado automaticamente

### AB-053 — Agendamento de entrega e instalação

**Issue:** #53  
**Labels:** `tipo: feature`, `área: carrinho e cotação`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF16, RN05

**Descrição**

Seleção de data para itens com instalação obrigatória.

**Critérios de aceite**

- [ ] Pedido com instalação obrigatória não finaliza sem data
- [ ] Datas indisponíveis bloqueadas

## Pagamento

### AB-054 — Integração do Payment Brick do Mercado Pago

**Issue:** #54  
**Labels:** `tipo: feature`, `área: pagamento`, `segurança`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF28, RF35, RF36, RF37

**Descrição**

Formulário embutido, tokenização no front, criação do pagamento em /v1/payments e 3DS2.

**Critérios de aceite**

- [ ] Nenhum dado de cartão chega ao backend
- [ ] Pagamento aprovado em sandbox
- [ ] 3DS2 funcionando quando exigido

### AB-055 — Pix e boleto via Mercado Pago com expiração

**Issue:** #55  
**Labels:** `tipo: feature`, `área: pagamento`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF29, RN14

**Descrição**

Geração de Pix e boleto com prazos de expiração configuráveis.

**Critérios de aceite**

- [ ] QR Code e linha digitável exibidos
- [ ] Pedido cancelado e reserva liberada ao expirar

### AB-056 — Parcelamento configurável

**Issue:** #56  
**Labels:** `tipo: feature`, `área: pagamento`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF14

**Descrição**

Máximo de parcelas por faixa de valor e por perfil de cliente.

**Critérios de aceite**

- [ ] Admin configura as faixas
- [ ] Brick exibe só as parcelas permitidas

### AB-057 — Webhook do Mercado Pago

**Issue:** #57  
**Labels:** `tipo: feature`, `área: pagamento`, `segurança`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF30, RN13

**Descrição**

Receber notificações, validar a assinatura e atualizar o pagamento.

**Critérios de aceite**

- [ ] Assinatura do webhook validada
- [ ] Processamento idempotente
- [ ] Pedido só confirma com status approved
- [ ] Túnel (`cloudflared`) expõe só `/api/webhooks/mercadopago` para o servidor local
- [ ] Reconciliação por `GET /v1/payments/{id}` quando o webhook não chega

### AB-058 — Status de pagamento e payment_id

**Issue:** #58  
**Labels:** `tipo: feature`, `área: pagamento`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF31, RF32

**Descrição**

Armazenar payment_id e exibir o status em tempo real.

**Critérios de aceite**

- [ ] payment_id vinculado ao pedido
- [ ] Status atualizado na área do cliente sem recarregar

### AB-062 — Checklist PCI-DSS SAQ A

**Issue:** #62  
**Labels:** `tipo: task`, `área: pagamento`, `segurança`  
**Milestone:** v1.0.0 · **Etapa:** Etapa 6 — Qualidade, Segurança e Lançamento  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RN19

**Descrição**

Verificar os requisitos mínimos do SAQ A para o checkout transparente.

**Critérios de aceite**

- [ ] Checklist preenchido e versionado
- [ ] Pendências viram issues

## Financeiro

### AB-059 — Estornos total e parcial

**Issue:** #59  
**Labels:** `tipo: feature`, `área: financeiro`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF34, RN07, RN18, RN22

**Descrição**

Estorno via API respeitando as políticas e o direito de arrependimento.

**Critérios de aceite**

- [ ] Estorno de pedido faturado exige aprovação do financeiro
- [ ] Arrependimento de PF em até 7 dias gera reembolso integral
- [ ] Estorno registrado em auditoria

### AB-060 — Fluxo de pagamento faturado 28/56 dias

**Issue:** #60  
**Labels:** `tipo: feature`, `área: financeiro`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF12, RF33, RN03, RN17

**Descrição**

Fluxo próprio fora do Mercado Pago, com boleto e controle de vencimentos.

**Critérios de aceite**

- [ ] Disponível só para contas aprovadas
- [ ] Vencimentos em 28 e 56 dias
- [ ] Baixa manual registrada

### AB-061 — Aprovação de crédito corporativo

**Issue:** #61  
**Labels:** `tipo: feature`, `área: financeiro`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 4 — Fluxo B2B  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF58, RN10

**Descrição**

Financeiro aprova contas para o faturado e define o limite de crédito.

**Critérios de aceite**

- [ ] Limite excedido bloqueia novo pedido faturado
- [ ] Histórico de alterações de limite

### AB-063 — Emissão de NF-e via API

**Issue:** #63  
**Labels:** `tipo: feature`, `área: financeiro`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF13

**Descrição**

Emissão automática em homologação após a confirmação do pedido.

**Critérios de aceite**

- [ ] XML, DANFE e chave armazenados no pedido
- [ ] Falha de emissão gera alerta e reprocessamento

## Pedidos

### AB-064 — Reserva, baixa e liberação de estoque

**Issue:** #64  
**Labels:** `tipo: feature`, `área: pedidos`, `banco`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF43, RF44, RN14

**Descrição**

Reserva na criação do pedido, baixa na confirmação e liberação na expiração ou cancelamento.

**Critérios de aceite**

- [ ] Dois pedidos simultâneos não reservam a mesma unidade
- [ ] Estoque disponível desconta reservas
- [ ] Reposição manual registrada
- [ ] Reserva feita em transação com `SELECT ... FOR UPDATE` no MySQL, coberta por teste de concorrência

### AB-065 — Ciclo de vida do pedido

**Issue:** #65  
**Labels:** `tipo: feature`, `área: pedidos`, `banco`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF54

**Descrição**

Implementar os status e as transições permitidas do pedido.

**Critérios de aceite**

- [ ] Transições inválidas recusadas
- [ ] Cada transição grava data e responsável

### AB-066 — Rastreamento do pedido

**Issue:** #66  
**Labels:** `tipo: feature`, `área: pedidos`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF15

**Descrição**

Linha do tempo do pedido e código de rastreio na área do cliente.

**Critérios de aceite**

- [ ] Linha do tempo com todos os status
- [ ] Código de rastreio exibido quando houver

### AB-067 — E-mails transacionais

**Issue:** #67  
**Labels:** `tipo: feature`, `área: pedidos`  
**Milestone:** v0.3.0 · **Etapa:** Etapa 3 — Carrinho, Frete e Checkout  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF53

**Descrição**

Templates com a identidade visual para cadastro, cotação, aprovação, pagamento, NF-e, envio, entrega e chamados.

**Critérios de aceite**

- [ ] Templates responsivos
- [ ] Disparo em cada evento listado
- [ ] Envio com fila e nova tentativa

## Pós-venda

### AB-068 — Chamados de garantia e assistência técnica

**Issue:** #68  
**Labels:** `tipo: feature`, `área: pós-venda`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF17, RN12

**Descrição**

Abertura de chamado vinculado ao produto comprado, com anexos.

**Critérios de aceite**

- [ ] Chamado vinculado a pedido e item
- [ ] Status acompanhado pelo cliente

### AB-069 — Canal com vendedor dedicado (WhatsApp)

**Issue:** #69  
**Labels:** `tipo: feature`, `área: pós-venda`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF18, RN11

**Descrição**

Botão de contato com o vendedor da conta na PDP e no carrinho.

**Critérios de aceite**

- [ ] Vendedor definido por região ou segmento
- [ ] Cliente não altera o vendedor

### AB-070 — Agendamento de demonstração

**Issue:** #70  
**Labels:** `tipo: feature`, `área: pós-venda`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P2 · **Status inicial:** Backlog  
**Referências:** RF19

**Descrição**

Solicitação de reunião para itens complexos.

**Critérios de aceite**

- [ ] Cliente escolhe data e horário
- [ ] Comercial recebe a solicitação

### AB-071 — Fluxo de troca, devolução e arrependimento

**Issue:** #71  
**Labels:** `tipo: feature`, `área: pós-venda`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RN12, RN22

**Descrição**

Solicitação de devolução com regras distintas para PF e PJ.

**Critérios de aceite**

- [ ] PF solicita arrependimento em até 7 dias do recebimento
- [ ] Itens personalizados de PJ bloqueados, salvo defeito

## Back office

### AB-073 — Promoções, cupons e frete cortesia

**Issue:** #73  
**Labels:** `tipo: feature`, `área: back office`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF46, RN23

**Descrição**

Descontos por produto, categoria ou cupom, com vigência.

**Critérios de aceite**

- [ ] Promoção ativa só dentro da vigência
- [ ] Frete cortesia só por regra configurada

### AB-074 — Páginas institucionais editáveis

**Issue:** #74  
**Labels:** `tipo: feature`, `área: back office`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RF57

**Descrição**

Termos, privacidade, trocas e garantia editáveis no back office.

**Critérios de aceite**

- [ ] Admin edita sem deploy
- [ ] Páginas linkadas no footer e no checkout

### AB-075 — LGPD: consentimento e direitos do titular

**Issue:** #75  
**Labels:** `tipo: task`, `área: back office`, `segurança`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P0 · **Status inicial:** Backlog  
**Referências:** RF56, RNF03

**Descrição**

Banner de cookies, exportação e exclusão/anonimização de dados, com dados pessoais e financeiros protegidos em trânsito e em repouso.

**Critérios de aceite**

- [ ] Cookies não essenciais só após consentimento
- [ ] Exportação de dados em formato legível
- [ ] Exclusão anonimiza sem quebrar pedidos e notas
- [ ] Dados pessoais sensíveis criptografados em repouso e acesso restrito por perfil

### AB-076 — Log de auditoria de ações sensíveis

**Issue:** #76  
**Labels:** `tipo: task`, `área: back office`, `segurança`  
**Milestone:** v0.4.0 · **Etapa:** Etapa 5 — Pós-venda e Back Office  
**Prioridade:** P1 · **Status inicial:** Backlog  
**Referências:** RNF12

**Descrição**

Registro de aprovações, preços, crédito, estornos e perfis.

**Critérios de aceite**

- [ ] Log com usuário, data/hora, IP e valores anterior e novo
- [ ] Log não editável pela interface
