# Atelier Bureau — Estrutura do Quadro no Trello

Cada etapa abaixo é uma **lista** do Trello, na ordem em que aparecem. Cada issue vira um **card** com o mesmo ID usado no GitHub.

## Como montar o quadro

1. Crie o quadro **Atelier Bureau — Project SENAI**.
2. Crie as listas de etapa (seção “Listas”), que funcionam como **backlog** por etapa, e, ao final, as listas de fluxo: **Bloqueado**, **Em andamento**, **Em revisão**, **Em teste**, **Em validação** e **Concluído**.
3. Para criar vários cards de uma vez: copie o bloco “Cards para colar” da etapa, cole no campo de novo card da lista e confirme a opção de criar um card por linha.
4. Abra cada card e adicione as etiquetas e o checklist listados no detalhamento.
5. No card, cole o link da issue correspondente do GitHub (Power-Up do GitHub, se disponível). O número da issue é o mesmo do ID (`AB-018` = #18).
6. Mantenha o Status do GitHub Project [Atelier Bureau](https://github.com/users/Ks7dev/projects/1) igual à lista do card.

## Fluxo de trabalho

| Lista | Entra quando | Sai quando |
|---|---|---|
| Etapa N (backlog) | Card criado a partir da issue | Alguém assume o card |
| Em andamento | Responsável definido e branch criada | Pull request aberto |
| Em revisão | PR aberto e CI passando | PR aprovado em code review |
| Em teste | PR aprovado | Testes automatizados e manuais passam em homologação |
| Em validação | Testes concluídos | Critérios de aceite conferidos com o requisito (RF/RN/RNF) pelo responsável do produto |
| Concluído | PR mesclado, critérios marcados e issue fechada | — |
| Bloqueado | Depende de decisão, de outra issue ou de fator externo | Impedimento resolvido; o card volta para a lista de onde saiu |

Regras:

- Um card só avança com o checklist da lista anterior cumprido; reprovação em teste ou validação devolve o card para **Em andamento**.
- Card em **Bloqueado** leva um comentário com o motivo e, quando for o caso, o ID da issue que o bloqueia.
- Cards de decisão e de design (sem código) pulam **Em revisão** e **Em teste** e vão direto para **Em validação**.

## Etiquetas

| Etiqueta | Cor sugerida | Uso |
|---|---|---|
| P0 — MVP | Vermelho | Essencial |
| P1 — Importante | Laranja | Importante |
| P2 — Desejável | Amarelo | Desejável |
| Decisão | Roxo | Precisa de definição |
| Design | Rosa | Identidade visual e UI |
| Backend | Azul | Regras, APIs e integrações |
| Frontend | Verde | Telas e componentes |
| Infra/Qualidade | Preto | Ambiente, testes e operação |
| Integração externa | Azul-claro | Mercado Pago, ViaCEP, Correios, NF-e |

## Listas

| # | Lista | Prazo | Cards | Objetivo |
|---|---|---|---|---|
| 1 | Etapa 0 — Planejamento e Decisões | Dia 1 (10/11/2026) | 6 | Fechar decisões que bloqueiam o desenvolvimento. |
| 2 | Etapa 1 — Fundação Técnica e Design System | Dia 1 (10/11/2026) | 12 | Repositório, padrões, banco, CI e biblioteca de componentes. |
| 3 | Etapa 2 — Catálogo e Conta | Dia 2 (11/11/2026) | 19 | Vitrine navegável, cadastro de produtos e contas PF/PJ. |
| 4 | Etapa 3 — Carrinho, Frete e Checkout | Dia 3 (12/11/2026) | 19 | Compra completa via Mercado Pago com frete calculado. |
| 5 | Etapa 4 — Fluxo B2B | Dia 4 (13/11/2026) | 7 | Cotação, aprovação, faturado e crédito corporativo. |
| 6 | Etapa 5 — Pós-venda e Back Office | Dia 4 (13/11/2026) | 10 | Atendimento, promoções, conteúdo, LGPD e auditoria. |
| 7 | Etapa 6 — Qualidade, Segurança e Lançamento | Dia 5 (14/11/2026), entrega final | 9 | Testes, performance, acessibilidade, monitoramento e deploy. |
| 8 | Bloqueado | — | — | Cards impedidos |
| 9 | Em andamento | — | — | Fluxo de trabalho |
| 10 | Em revisão | — | — | Fluxo de trabalho |
| 11 | Em teste | — | — | Fluxo de trabalho |
| 12 | Em validação | — | — | Fluxo de trabalho |
| 13 | Concluído | — | — | Fluxo de trabalho |

---

## Etapa 0 — Planejamento e Decisões

**Prazo:** Dia 1 (10/11/2026) · **Objetivo:** Fechar decisões que bloqueiam o desenvolvimento.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-001 — Definir stack e estrutura de pastas com base nos repositórios CRM e Core
AB-002 — Validar o nome Atelier Bureau (INPI e domínio)
AB-003 — Escolher a biblioteca oficial de ícones
AB-004 — Validação jurídica das políticas de troca, arrependimento e garantia
AB-005 — Confirmar os valores configuráveis das regras de negócio
AB-018 — Corrigir as divergências do protótipo Stitch
```

### Detalhamento dos cards

#### AB-001 — Definir stack e estrutura de pastas com base nos repositórios CRM e Core

**Etiquetas:** P0 — MVP, Decisão  
**Issue:** #1 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF07

Levantar linguagem, framework, ORM, padrão de pastas, convenções de commit e de issues usados no CRM e no Core e registrar como padrão do projeto.

Checklist “Critérios de aceite”:

- [ ] Documento ARCHITECTURE.md no repositório com stack e justificativa
- [ ] Estrutura de pastas MVC definida por módulo
- [ ] Convenção de branches e commits definida

#### AB-002 — Validar o nome Atelier Bureau (INPI e domínio)

**Etiquetas:** P1 — Importante, Decisão  
**Issue:** #2 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** Seção 1.1

Pesquisar o nome na base do INPI (classe 35) e a disponibilidade do domínio .com.br.

> Card começa em **Em andamento**: em formalização pelo responsável.

Checklist “Critérios de aceite”:

- [ ] Resultado da busca no INPI registrado
- [ ] Domínio verificado
- [ ] Nome confirmado ou alternativa aprovada

#### AB-003 — Escolher a biblioteca oficial de ícones

**Etiquetas:** P1 — Importante, Decisão  
**Issue:** #3 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF15

Decidir entre Lucide, Phosphor (light) ou Material Symbols para manter coerência com o tom editorial.

> Decisão tomada (Lucide): card vai direto para **Concluído**.

Checklist “Critérios de aceite”:

- [x] Biblioteca escolhida: Lucide (`lucide-react`)
- [x] ~~Ícones do protótipo mapeados~~ movido para a #18

#### AB-004 — Validação jurídica das políticas de troca, arrependimento e garantia

**Etiquetas:** P1 — Importante, Decisão  
**Issue:** #4 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RN06, RN12, RN22

Validar o tratamento de itens personalizados para PF, a redação da garantia estendida e os termos de uso.

> Card começa em **Em andamento**: em formalização pelo responsável.

Checklist “Critérios de aceite”:

- [ ] Política de trocas e devoluções aprovada
- [ ] Texto da garantia estendida aprovado
- [ ] Termos de uso e política de privacidade aprovados

#### AB-005 — Confirmar os valores configuráveis das regras de negócio

**Etiquetas:** P1 — Importante, Decisão  
**Issue:** #5 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RN01, RN06, RN14, RN16, RN20

Validar com os stakeholders os valores iniciais: aprovação acima de R$ 10.000, garantia acima de R$ 5.000, expiração de Pix/boleto, faixas de CEP da cobertura e limites de frete.

> Valores confirmados: card vai direto para **Concluído**.

Checklist “Critérios de aceite”:

- [x] Valores confirmados e registrados no documento de requisitos
- [x] ~~Valores carregados como seed de configuração~~ movido para a #8

#### AB-018 — Corrigir as divergências do protótipo Stitch

**Etiquetas:** P1 — Importante, Design  
**Issue:** #18 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** Seção 7

Ajustar prazo faturado para 28/56, remover frete cortesia fixo, marcar CNPJ como fictício, trocar placeholders do logo e unificar todas as telas no Warm Editorial Atelier.

Checklist “Critérios de aceite”:

- [ ] Nenhuma tela usa Newsreader ou Space Grotesk
- [ ] Prazos e textos alinhados ao documento v2
- [ ] Ícones do protótipo mapeados para o Lucide (`lucide-react`), decisão da #3

## Etapa 1 — Fundação Técnica e Design System

**Prazo:** Dia 1 (10/11/2026) · **Objetivo:** Repositório, padrões, banco, CI e biblioteca de componentes.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-006 — Setup do repositório: estrutura MVC, lint, formatter e templates
AB-007 — Configurar ambientes e variáveis (dev, homologação, produção)
AB-008 — Modelagem do banco de dados e migrations iniciais
AB-009 — Pipeline de CI com lint, testes e build
AB-010 — Padrão de tratamento de erros, logs e rate limiting
AB-011 — HTTPS obrigatório e headers de segurança
AB-012 — Padrão de documentação de código
AB-013 — Criar os tokens do design system Warm Editorial Atelier
AB-014 — Redesenhar o logo e criar o kit de marca
AB-015 — Componentes base da biblioteca de UI
AB-017 — Layout base: header, footer e grid responsivo
AB-019 — Prototipar as telas faltantes
```

### Detalhamento dos cards

#### AB-006 — Setup do repositório: estrutura MVC, lint, formatter e templates

**Etiquetas:** P0 — MVP, Infra/Qualidade  
**Issue:** #6 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF07, RNF08

Criar a estrutura inicial seguindo o padrão definido no AB-001, com lint, formatter, README e templates de issue e pull request.

Checklist “Critérios de aceite”:

- [ ] Projeto roda localmente com um comando documentado
- [ ] Lint e formatter configurados e passando
- [ ] Templates de issue e PR criados em .github/

#### AB-007 — Configurar ambientes e variáveis (dev, homologação, produção)

**Etiquetas:** P0 — MVP, Infra/Qualidade  
**Issue:** #7 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF05, RNF16

Separar configurações por ambiente (dev e servidor local) e garantir que segredos (chaves Mercado Pago, NF-e, transportadoras, senhas do MySQL) nunca fiquem no código. O servidor roda em Docker na máquina local (`ARCHITECTURE.md`, seção 5.1).

Checklist “Critérios de aceite”:

- [ ] Arquivo .env.example documentado
- [ ] Segredos fora do repositório
- [ ] Credenciais de sandbox usadas em dev e homologação
- [ ] `docker-compose.yml` com `app`, `db` (MySQL 8, `utf8mb4`), `proxy` (Caddy) e `backup`, subindo com um único `docker compose up -d`
- [ ] `.env.example` com `DATABASE_URL` e demais chaves; usuário de banco da aplicação sem permissão de DDL

#### AB-008 — Modelagem do banco de dados e migrations iniciais

**Etiquetas:** P0 — MVP, Infra/Qualidade, Backend  
**Issue:** #8 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RF41, RF09, RF54, RNF16

Modelar no `prisma/schema.prisma` (MySQL 8, InnoDB, `utf8mb4`) as entidades principais: usuário, conta corporativa, perfil, endereço, produto, SKU, categoria, carrinho, cotação, pedido, pagamento, frete, estoque e configuração. Seguir a seção 5 do `ARCHITECTURE.md`.

Checklist “Critérios de aceite”:

- [ ] Diagrama ER no repositório
- [ ] Migrations criam todas as tabelas
- [ ] Seeds de desenvolvimento com produtos e contas de teste
- [ ] Valores das regras de negócio confirmados na #5 carregados como seed de configuração
- [ ] Schema Prisma com `provider = "mysql"`, FKs, `UNIQUE` (CPF, CNPJ, e-mail, SKU, `payment_id`) e índices de filtro/busca (incluindo `FULLTEXT`)
- [ ] Valores monetários em `DECIMAL(12,2)` e datas em UTC
- [ ] `npx prisma migrate dev` e `npx prisma db seed` rodam do zero no MySQL do Docker

#### AB-009 — Pipeline de CI com lint, testes e build

**Etiquetas:** P0 — MVP, Infra/Qualidade  
**Issue:** #9 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF07

Criar pipeline que roda a cada pull request.

Checklist “Critérios de aceite”:

- [ ] Pipeline executa lint, testes e build
- [ ] PR bloqueado quando o pipeline falha

#### AB-010 — Padrão de tratamento de erros, logs e rate limiting

**Etiquetas:** P0 — MVP, Infra/Qualidade, Backend  
**Issue:** #10 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF05

Middleware global de erros sem vazamento de stack trace, logs estruturados e limite de requisições nas rotas públicas e de autenticação.

Checklist “Critérios de aceite”:

- [ ] Respostas de erro padronizadas sem detalhes internos
- [ ] Rate limiting ativo em login, cadastro e APIs públicas
- [ ] Logs estruturados com identificador de requisição

#### AB-011 — HTTPS obrigatório e headers de segurança

**Etiquetas:** P0 — MVP, Infra/Qualidade, Backend  
**Issue:** #11 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF06, RNF16

Forçar HTTPS sem fallback e configurar HSTS, CSP e demais headers de segurança.

Checklist “Critérios de aceite”:

- [ ] Requisições HTTP redirecionadas ou recusadas
- [ ] HSTS e CSP configurados
- [ ] Verificação em ferramenta de análise de headers sem alertas críticos
- [ ] Caddy com `tls internal` na frente do app; certificado raiz exportado e instalável nos dispositivos da rede
- [ ] Porta 80 só redireciona para 443

#### AB-012 — Padrão de documentação de código

**Etiquetas:** P1 — Importante, Infra/Qualidade  
**Issue:** #12 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF08

Definir o padrão JSDoc/docstrings e a geração de documentação por módulo.

Checklist “Critérios de aceite”:

- [ ] Guia de documentação no repositório
- [ ] Lint acusa função pública sem documentação

#### AB-013 — Criar os tokens do design system Warm Editorial Atelier

**Etiquetas:** P0 — MVP, Design  
**Issue:** #13 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF13, RNF15

Arquivo único de tokens com a paleta aprovada (terracota ajustada para #7A5C4C, texto terciário só em desabilitados), tipografia Playfair Display + Plus Jakarta Sans, espaçamentos, raios e sombras.

Checklist “Critérios de aceite”:

- [ ] Arquivo único de tokens versionado
- [ ] Todas as combinações de texto com contraste de pelo menos 4,5:1
- [ ] Paleta Material duplicada e Space Grotesk removidas

#### AB-014 — Redesenhar o logo e criar o kit de marca

**Etiquetas:** P1 — Importante, Design  
**Issue:** #14 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** Seção 7

Novo símbolo sem leitura de botão “+” ou de farmácia, texto convertido em curvas e versões de uso.

Checklist “Critérios de aceite”:

- [ ] Versões horizontal, monograma, negativo e monocromática em SVG
- [ ] Favicons 32, 180 e 512 px
- [ ] Logo legível em 24 px de altura

#### AB-015 — Componentes base da biblioteca de UI

**Etiquetas:** P0 — MVP, Design  
**Issue:** #15 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF09, RNF13

Botões (primário, ghost, texto editorial), inputs, select, checkbox, radio, chips, badges, tooltip e modal.

Checklist “Critérios de aceite”:

- [ ] Componentes usam apenas tokens
- [ ] Estados hover, foco, desabilitado e erro
- [ ] Navegáveis por teclado com foco visível

#### AB-017 — Layout base: header, footer e grid responsivo

**Etiquetas:** P0 — MVP, Design  
**Issue:** #17 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** RNF15

Grid de 12/8/4 colunas, max-width de 1440 px, header com busca, menu e carrinho, e footer institucional.

Checklist “Critérios de aceite”:

- [ ] Breakpoints mobile, tablet e desktop funcionando
- [ ] Menu mobile acessível
- [ ] Footer com links das páginas institucionais

#### AB-019 — Prototipar as telas faltantes

**Etiquetas:** P1 — Importante, Design  
**Issue:** #19 · **Área:** app · **Milestone:** v0.1.0 · **Referências:** Seção 7

Login/cadastro, área do cliente, cotação, aprovação, checkout com Payment Brick, rastreamento, comparador e back office.

Checklist “Critérios de aceite”:

- [ ] Telas desktop e mobile no Stitch
- [ ] Telas revisadas contra os requisitos correspondentes

## Etapa 2 — Catálogo e Conta

**Prazo:** Dia 2 (11/11/2026) · **Objetivo:** Vitrine navegável, cadastro de produtos e contas PF/PJ.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-016 — Componentes de commerce
AB-021 — Cadastro de produtos no back office
AB-022 — Upload de imagens com conversão para WebP
AB-023 — Categorias, subcategorias e navegação
AB-024 — Listagem de produtos (PLP) com filtros avançados
AB-025 — Busca de produtos
AB-026 — Página de produto (PDP)
AB-027 — Comparador de até 4 produtos
AB-028 — Inativação de produtos sem perda de histórico
AB-029 — Importação de produtos via CSV
AB-030 — Home editorial com carrossel editável
AB-032 — Cadastro e login de PF e PJ
AB-033 — Recuperação de senha e 2FA opcional
AB-034 — Conta corporativa multiusuário com consulta de CNPJ
AB-035 — Perfis de acesso da conta corporativa
AB-036 — Múltiplos endereços por conta
AB-037 — Área do cliente
AB-038 — Lista de favoritos
AB-072 — Usuários internos e permissões
```

### Detalhamento dos cards

#### AB-016 — Componentes de commerce

**Etiquetas:** P1 — Importante, Design  
**Issue:** #16 · **Área:** app · **Milestone:** v0.2.0 · **Referências:** RNF09

Card de produto, swatches de material, accordion de especificações, drawer de carrinho e resumo de pedido.

Checklist “Critérios de aceite”:

- [ ] Componentes reutilizados na PLP, PDP e carrinho
- [ ] Comportamento responsivo nos três breakpoints

#### AB-021 — Cadastro de produtos no back office

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #21 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF41, RN06, RN09

CRUD completo: nome, descrição, especificações, categoria, preço, imagens, peso/dimensões, certificações, garantia, edição limitada e numeração de lote.

Checklist “Critérios de aceite”:

- [ ] Produto com certificação obrigatória não publica sem documento anexado
- [ ] Peso e dimensões obrigatórios
- [ ] Garantia estendida marcada automaticamente acima do valor configurado

#### AB-022 — Upload de imagens com conversão para WebP

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #22 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RNF04

Aceitar JPG, PNG e WebP, converter para WebP no servidor com no máximo 300 KB e gerar versões responsivas.

Checklist “Critérios de aceite”:

- [ ] Arquivos fora dos formatos aceitos são recusados com mensagem clara
- [ ] Imagem final em WebP com até 300 KB
- [ ] Versões em tamanhos diferentes geradas

#### AB-023 — Categorias, subcategorias e navegação

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #23 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF01

Árvore de categorias gerenciável e menu de navegação.

Checklist “Critérios de aceite”:

- [ ] Admin cria, edita e reordena categorias
- [ ] Menu reflete a árvore sem alteração de código

#### AB-024 — Listagem de produtos (PLP) com filtros avançados

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #24 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF02

Filtros por marca, faixa de preço, material/acabamento, especificação técnica e prazo de entrega, com ordenação e paginação.

Checklist “Critérios de aceite”:

- [ ] Filtros combináveis e refletidos na URL
- [ ] Contagem de resultados por filtro
- [ ] Estado vazio tratado

#### AB-025 — Busca de produtos

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #25 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF02

Busca textual por nome, descrição e especificação, com sugestões.

Checklist “Critérios de aceite”:

- [ ] Busca tolera acentos e caixa
- [ ] Produtos inativos não aparecem
- [ ] Página de resultados usa os mesmos filtros da PLP

#### AB-026 — Página de produto (PDP)

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #26 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF03, RF18

Galeria, especificações, ficha técnica em PDF, garantia, certificações, prazo, botão de cotação e contato com o vendedor.

Checklist “Critérios de aceite”:

- [ ] Ficha técnica em PDF disponível para download
- [ ] Sinalização de sob encomenda quando sem estoque
- [ ] Botões de comprar e de solicitar cotação

#### AB-027 — Comparador de até 4 produtos

**Etiquetas:** P2 — Desejável, Frontend, Backend  
**Issue:** #27 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF04

Comparação lado a lado de especificações.

Checklist “Critérios de aceite”:

- [ ] Limite de 4 produtos com aviso
- [ ] Especificações alinhadas por atributo
- [ ] Comparação mantida durante a navegação

#### AB-028 — Inativação de produtos sem perda de histórico

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #28 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF42

Produto inativo sai da vitrine e da busca, mas permanece nos pedidos antigos.

Checklist “Critérios de aceite”:

- [ ] Produto inativo some da vitrine e da busca
- [ ] Pedidos antigos continuam exibindo o produto

#### AB-029 — Importação de produtos via CSV

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #29 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF48, RNF04

Importação em massa com validação e relatório de erros por linha.

Checklist “Critérios de aceite”:

- [ ] Modelo de CSV para download
- [ ] Relatório de erros por linha
- [ ] Linhas válidas importadas mesmo com erros em outras

#### AB-030 — Home editorial com carrossel editável

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #30 · **Área:** catálogo · **Milestone:** v0.2.0 · **Referências:** RF47

Home conforme o protótipo, com carrossel e vitrines configuráveis pelo admin.

Checklist “Critérios de aceite”:

- [ ] Admin altera imagens, textos e produtos sem deploy
- [ ] Carrossel acessível (pausa e navegação por teclado)

#### AB-032 — Cadastro e login de PF e PJ

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #32 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF39

Fluxos distintos para CPF e CNPJ com validação de documento.

Checklist “Critérios de aceite”:

- [ ] Validação de CPF e CNPJ
- [ ] Dados obrigatórios distintos por tipo de conta
- [ ] Senha armazenada com hash seguro

#### AB-033 — Recuperação de senha e 2FA opcional

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #33 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF40

Recuperação por e-mail com token expirável e 2FA opcional para contas corporativas.

Checklist “Critérios de aceite”:

- [ ] Token de recuperação expira e é de uso único
- [ ] 2FA ativável pela conta corporativa

#### AB-034 — Conta corporativa multiusuário com consulta de CNPJ

**Etiquetas:** P0 — MVP, Integração externa, Frontend, Backend  
**Issue:** #34 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF09

Consultar CNPJ via API (ex: BrasilAPI), preencher razão social e permitir convidar usuários.

Checklist “Critérios de aceite”:

- [ ] CNPJ inativo bloqueia o cadastro
- [ ] Razão social preenchida automaticamente
- [ ] Convite de usuário por e-mail

#### AB-035 — Perfis de acesso da conta corporativa

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #35 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF10, RN08

Perfis solicitante, aprovador, financeiro e administrador da conta.

Checklist “Critérios de aceite”:

- [ ] Conta multiusuário exige pelo menos um aprovador
- [ ] Conta de usuário único acumula administrador e aprovador
- [ ] Permissões aplicadas no backend

#### AB-036 — Múltiplos endereços por conta

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #36 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF26

Cadastro de matriz, filiais e obras como endereços de entrega.

Checklist “Critérios de aceite”:

- [ ] CRUD de endereços com apelido
- [ ] Endereço padrão definido

#### AB-037 — Área do cliente

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #37 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF31, RF15

Painel com pedidos, cotações, dados, endereços, usuários (PJ) e favoritos.

Checklist “Critérios de aceite”:

- [ ] Lista de pedidos com status
- [ ] Acesso de acordo com o perfil do usuário

#### AB-038 — Lista de favoritos

**Etiquetas:** P2 — Desejável, Frontend, Backend  
**Issue:** #38 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF45

Cliente logado adiciona e remove produtos dos favoritos.

Checklist “Critérios de aceite”:

- [ ] Favoritos persistem entre sessões
- [ ] Ação disponível no card e na PDP

#### AB-072 — Usuários internos e permissões

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #72 · **Área:** acesso · **Milestone:** v0.2.0 · **Referências:** RF55

Perfis administrador, comercial, financeiro e estoque com permissões por módulo.

Checklist “Critérios de aceite”:

- [ ] Cada perfil acessa só os seus módulos
- [ ] Permissões verificadas no backend

## Etapa 3 — Carrinho, Frete e Checkout

**Prazo:** Dia 3 (12/11/2026) · **Objetivo:** Compra completa via Mercado Pago com frete calculado.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-039 — Consulta de endereço via ViaCEP com fallback
AB-040 — Módulo de frete com estratégias por modalidade
AB-041 — Integração com a API dos Correios
AB-042 — Integração com agregador de transportadoras
AB-043 — Entrega própria com montagem por faixa de CEP
AB-044 — Cotação manual de frete como contingência
AB-045 — Recotação de frete ao alterar endereço
AB-046 — Carrinho e lista de projeto salva
AB-047 — Personalização e serviços adicionais no carrinho
AB-053 — Agendamento de entrega e instalação
AB-054 — Integração do Payment Brick do Mercado Pago
AB-055 — Pix e boleto via Mercado Pago com expiração
AB-056 — Parcelamento configurável
AB-057 — Webhook do Mercado Pago
AB-058 — Status de pagamento e payment_id
AB-064 — Reserva, baixa e liberação de estoque
AB-065 — Ciclo de vida do pedido
AB-066 — Rastreamento do pedido
AB-067 — E-mails transacionais
```

### Detalhamento dos cards

#### AB-039 — Consulta de endereço via ViaCEP com fallback

**Etiquetas:** P0 — MVP, Integração externa, Backend  
**Issue:** #39 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RF22, RF23, RF24, RF38, RN21

Preenchimento automático a partir do CEP, com validação e digitação manual em caso de falha.

Checklist “Critérios de aceite”:

- [ ] CEP validado com 8 dígitos antes da consulta
- [ ] Timeout libera digitação manual
- [ ] Checkout nunca bloqueia por falha do ViaCEP

#### AB-040 — Módulo de frete com estratégias por modalidade

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #40 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RF25, RN20

Serviço que escolhe Correios, transportadora ou entrega própria conforme peso, dimensões e CEP.

Checklist “Critérios de aceite”:

- [ ] Regra da RN20 aplicada e coberta por testes
- [ ] Novas modalidades adicionáveis sem alterar o checkout
- [ ] Frete calculado pelo maior entre peso real e peso cubado, somado por volume, com fator de cubagem configurável

#### AB-041 — Integração com a API dos Correios

**Etiquetas:** P0 — MVP, Integração externa, Backend  
**Issue:** #41 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RF25

Cálculo de PAC e SEDEX para volumes dentro dos limites.

Checklist “Critérios de aceite”:

- [ ] Volume fora dos limites não é cotado nos Correios
- [ ] Erro da API cai no fallback

#### AB-042 — Integração com agregador de transportadoras

**Etiquetas:** P1 — Importante, Integração externa, Backend  
**Issue:** #42 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RF49

Cotação de frete para volumes grandes via agregador (ex: Melhor Envio) em sandbox.

Checklist “Critérios de aceite”:

- [ ] Exibe transportadora, prazo e valor
- [ ] Erro da API cai no fallback

#### AB-043 — Entrega própria com montagem por faixa de CEP

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #43 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RF27, RF50, RN16

Tabela de faixas de CEP e peso configurável no back office.

Checklist “Critérios de aceite”:

- [ ] Admin edita faixas e valores
- [ ] Indicação de cobertura exibida no checkout

#### AB-044 — Cotação manual de frete como contingência

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #44 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RN16, RN20

Encaminhar ao comercial pedidos sem frete calculável.

Checklist “Critérios de aceite”:

- [ ] Pedido segue para a fila do comercial
- [ ] Cliente é avisado do prazo de retorno

#### AB-045 — Recotação de frete ao alterar endereço

**Etiquetas:** P2 — Desejável, Backend  
**Issue:** #45 · **Área:** frete · **Milestone:** v0.3.0 · **Referências:** RN15

Mudança de endereço após o pedido exige nova cotação de frete e prazo.

Checklist “Critérios de aceite”:

- [ ] Alteração gera nova cotação
- [ ] Cliente confirma a diferença antes de seguir

#### AB-046 — Carrinho e lista de projeto salva

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #46 · **Área:** carrinho e cotação · **Milestone:** v0.3.0 · **Referências:** RF07

Carrinho persistente e opção de salvar como lista/projeto.

Checklist “Critérios de aceite”:

- [ ] Carrinho mantido após login
- [ ] Lista salva pode ser retomada e convertida em carrinho

#### AB-047 — Personalização e serviços adicionais no carrinho

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #47 · **Área:** carrinho e cotação · **Milestone:** v0.3.0 · **Referências:** RF51, RF52, RN24

Gravação a laser com prévia, embalagem institucional e montagem.

Checklist “Critérios de aceite”:

- [ ] Custo e prazo extra somados ao pedido
- [ ] Item personalizado não cancelável após início da produção

#### AB-053 — Agendamento de entrega e instalação

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #53 · **Área:** carrinho e cotação · **Milestone:** v0.3.0 · **Referências:** RF16, RN05

Seleção de data para itens com instalação obrigatória.

Checklist “Critérios de aceite”:

- [ ] Pedido com instalação obrigatória não finaliza sem data
- [ ] Datas indisponíveis bloqueadas

#### AB-054 — Integração do Payment Brick do Mercado Pago

**Etiquetas:** P0 — MVP, Integração externa, Backend  
**Issue:** #54 · **Área:** pagamento · **Milestone:** v0.3.0 · **Referências:** RF28, RF35, RF36, RF37

Formulário embutido, tokenização no front, criação do pagamento em /v1/payments e 3DS2.

Checklist “Critérios de aceite”:

- [ ] Nenhum dado de cartão chega ao backend
- [ ] Pagamento aprovado em sandbox
- [ ] 3DS2 funcionando quando exigido

#### AB-055 — Pix e boleto via Mercado Pago com expiração

**Etiquetas:** P0 — MVP, Integração externa, Backend  
**Issue:** #55 · **Área:** pagamento · **Milestone:** v0.3.0 · **Referências:** RF29, RN14

Geração de Pix e boleto com prazos de expiração configuráveis.

Checklist “Critérios de aceite”:

- [ ] QR Code e linha digitável exibidos
- [ ] Pedido cancelado e reserva liberada ao expirar

#### AB-056 — Parcelamento configurável

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #56 · **Área:** pagamento · **Milestone:** v0.3.0 · **Referências:** RF14

Máximo de parcelas por faixa de valor e por perfil de cliente.

Checklist “Critérios de aceite”:

- [ ] Admin configura as faixas
- [ ] Brick exibe só as parcelas permitidas

#### AB-057 — Webhook do Mercado Pago

**Etiquetas:** P0 — MVP, Integração externa, Backend  
**Issue:** #57 · **Área:** pagamento · **Milestone:** v0.3.0 · **Referências:** RF30, RN13

Receber notificações, validar a assinatura e atualizar o pagamento.

Checklist “Critérios de aceite”:

- [ ] Assinatura do webhook validada
- [ ] Processamento idempotente
- [ ] Pedido só confirma com status approved
- [ ] Túnel (`cloudflared`) expõe só `/api/webhooks/mercadopago` para o servidor local
- [ ] Reconciliação por `GET /v1/payments/{id}` quando o webhook não chega

#### AB-058 — Status de pagamento e payment_id

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #58 · **Área:** pagamento · **Milestone:** v0.3.0 · **Referências:** RF31, RF32

Armazenar payment_id e exibir o status em tempo real.

Checklist “Critérios de aceite”:

- [ ] payment_id vinculado ao pedido
- [ ] Status atualizado na área do cliente sem recarregar

#### AB-064 — Reserva, baixa e liberação de estoque

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #64 · **Área:** pedidos · **Milestone:** v0.3.0 · **Referências:** RF43, RF44, RN14

Reserva na criação do pedido, baixa na confirmação e liberação na expiração ou cancelamento.

Checklist “Critérios de aceite”:

- [ ] Dois pedidos simultâneos não reservam a mesma unidade
- [ ] Estoque disponível desconta reservas
- [ ] Reposição manual registrada
- [ ] Reserva feita em transação com `SELECT ... FOR UPDATE` no MySQL, coberta por teste de concorrência

#### AB-065 — Ciclo de vida do pedido

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #65 · **Área:** pedidos · **Milestone:** v0.3.0 · **Referências:** RF54

Implementar os status e as transições permitidas do pedido.

Checklist “Critérios de aceite”:

- [ ] Transições inválidas recusadas
- [ ] Cada transição grava data e responsável

#### AB-066 — Rastreamento do pedido

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #66 · **Área:** pedidos · **Milestone:** v0.3.0 · **Referências:** RF15

Linha do tempo do pedido e código de rastreio na área do cliente.

Checklist “Critérios de aceite”:

- [ ] Linha do tempo com todos os status
- [ ] Código de rastreio exibido quando houver

#### AB-067 — E-mails transacionais

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #67 · **Área:** pedidos · **Milestone:** v0.3.0 · **Referências:** RF53

Templates com a identidade visual para cadastro, cotação, aprovação, pagamento, NF-e, envio, entrega e chamados.

Checklist “Critérios de aceite”:

- [ ] Templates responsivos
- [ ] Disparo em cada evento listado
- [ ] Envio com fila e nova tentativa

## Etapa 4 — Fluxo B2B

**Prazo:** Dia 4 (13/11/2026) · **Objetivo:** Cotação, aprovação, faturado e crédito corporativo.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-048 — Solicitação de cotação com anexos
AB-049 — Número de cotação rastreável e validade
AB-050 — Back office comercial de cotações
AB-051 — Fluxo de aprovação de pedidos
AB-052 — Tabela de preços por cliente e desconto por volume
AB-060 — Fluxo de pagamento faturado 28/56 dias
AB-061 — Aprovação de crédito corporativo
```

### Detalhamento dos cards

#### AB-048 — Solicitação de cotação com anexos

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #48 · **Área:** carrinho e cotação · **Milestone:** v0.4.0 · **Referências:** RF05, RF08

Cotação de itens ou do carrinho inteiro com upload de arquivos.

Checklist “Critérios de aceite”:

- [ ] Anexos com tipos e tamanho limitados
- [ ] Cliente acompanha a cotação na área do cliente

#### AB-049 — Número de cotação rastreável e validade

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #49 · **Área:** carrinho e cotação · **Milestone:** v0.4.0 · **Referências:** RF06, RN02

Cotação com número único e validade de 15 dias.

Checklist “Critérios de aceite”:

- [ ] Número único gerado
- [ ] Cotação vencida exige revalidação de preços

#### AB-050 — Back office comercial de cotações

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #50 · **Área:** carrinho e cotação · **Milestone:** v0.4.0 · **Referências:** RF20

Comercial visualiza, responde e converte cotações em pedidos.

Checklist “Critérios de aceite”:

- [ ] Fila de cotações com status
- [ ] Conversão em pedido mantém os valores negociados

#### AB-051 — Fluxo de aprovação de pedidos

**Etiquetas:** P0 — MVP, Frontend, Backend  
**Issue:** #51 · **Área:** carrinho e cotação · **Milestone:** v0.4.0 · **Referências:** RF11, RN01

Pedidos acima do limite vão para o aprovador da conta.

Checklist “Critérios de aceite”:

- [ ] Aprovador diferente do solicitante
- [ ] Aprovação ou recusa registrada com data, usuário e justificativa
- [ ] Aprovador avisado por e-mail

#### AB-052 — Tabela de preços por cliente e desconto por volume

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #52 · **Área:** carrinho e cotação · **Milestone:** v0.4.0 · **Referências:** RF21, RN04

Preços diferenciados por cliente ou segmento e descontos automáticos por quantidade.

Checklist “Critérios de aceite”:

- [ ] Preço exibido conforme a tabela do cliente logado
- [ ] Desconto por volume aplicado automaticamente

#### AB-060 — Fluxo de pagamento faturado 28/56 dias

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #60 · **Área:** financeiro · **Milestone:** v0.4.0 · **Referências:** RF12, RF33, RN03, RN17

Fluxo próprio fora do Mercado Pago, com boleto e controle de vencimentos.

Checklist “Critérios de aceite”:

- [ ] Disponível só para contas aprovadas
- [ ] Vencimentos em 28 e 56 dias
- [ ] Baixa manual registrada

#### AB-061 — Aprovação de crédito corporativo

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #61 · **Área:** financeiro · **Milestone:** v0.4.0 · **Referências:** RF58, RN10

Financeiro aprova contas para o faturado e define o limite de crédito.

Checklist “Critérios de aceite”:

- [ ] Limite excedido bloqueia novo pedido faturado
- [ ] Histórico de alterações de limite

## Etapa 5 — Pós-venda e Back Office

**Prazo:** Dia 4 (13/11/2026) · **Objetivo:** Atendimento, promoções, conteúdo, LGPD e auditoria.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-059 — Estornos total e parcial
AB-063 — Emissão de NF-e via API
AB-068 — Chamados de garantia e assistência técnica
AB-069 — Canal com vendedor dedicado (WhatsApp)
AB-070 — Agendamento de demonstração
AB-071 — Fluxo de troca, devolução e arrependimento
AB-073 — Promoções, cupons e frete cortesia
AB-074 — Páginas institucionais editáveis
AB-075 — LGPD: consentimento e direitos do titular
AB-076 — Log de auditoria de ações sensíveis
```

### Detalhamento dos cards

#### AB-059 — Estornos total e parcial

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #59 · **Área:** financeiro · **Milestone:** v0.4.0 · **Referências:** RF34, RN07, RN18, RN22

Estorno via API respeitando as políticas e o direito de arrependimento.

Checklist “Critérios de aceite”:

- [ ] Estorno de pedido faturado exige aprovação do financeiro
- [ ] Arrependimento de PF em até 7 dias gera reembolso integral
- [ ] Estorno registrado em auditoria

#### AB-063 — Emissão de NF-e via API

**Etiquetas:** P1 — Importante, Integração externa, Backend  
**Issue:** #63 · **Área:** financeiro · **Milestone:** v0.4.0 · **Referências:** RF13

Emissão automática em homologação após a confirmação do pedido.

Checklist “Critérios de aceite”:

- [ ] XML, DANFE e chave armazenados no pedido
- [ ] Falha de emissão gera alerta e reprocessamento

#### AB-068 — Chamados de garantia e assistência técnica

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #68 · **Área:** pós-venda · **Milestone:** v0.4.0 · **Referências:** RF17, RN12

Abertura de chamado vinculado ao produto comprado, com anexos.

Checklist “Critérios de aceite”:

- [ ] Chamado vinculado a pedido e item
- [ ] Status acompanhado pelo cliente

#### AB-069 — Canal com vendedor dedicado (WhatsApp)

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #69 · **Área:** pós-venda · **Milestone:** v0.4.0 · **Referências:** RF18, RN11

Botão de contato com o vendedor da conta na PDP e no carrinho.

Checklist “Critérios de aceite”:

- [ ] Vendedor definido por região ou segmento
- [ ] Cliente não altera o vendedor

#### AB-070 — Agendamento de demonstração

**Etiquetas:** P2 — Desejável, Frontend, Backend  
**Issue:** #70 · **Área:** pós-venda · **Milestone:** v0.4.0 · **Referências:** RF19

Solicitação de reunião para itens complexos.

Checklist “Critérios de aceite”:

- [ ] Cliente escolhe data e horário
- [ ] Comercial recebe a solicitação

#### AB-071 — Fluxo de troca, devolução e arrependimento

**Etiquetas:** P1 — Importante, Frontend, Backend  
**Issue:** #71 · **Área:** pós-venda · **Milestone:** v0.4.0 · **Referências:** RN12, RN22

Solicitação de devolução com regras distintas para PF e PJ.

Checklist “Critérios de aceite”:

- [ ] PF solicita arrependimento em até 7 dias do recebimento
- [ ] Itens personalizados de PJ bloqueados, salvo defeito

#### AB-073 — Promoções, cupons e frete cortesia

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #73 · **Área:** back office · **Milestone:** v0.4.0 · **Referências:** RF46, RN23

Descontos por produto, categoria ou cupom, com vigência, e frete grátis a partir de um valor mínimo de pedido que varia conforme a região de entrega (faixas de CEP configuráveis, RN23).

Checklist “Critérios de aceite”:

- [ ] Promoção ativa só dentro da vigência
- [ ] Frete cortesia só por regra configurada
- [ ] Frete grátis aplicado quando o pedido atinge o mínimo configurado para a região de entrega

#### AB-074 — Páginas institucionais editáveis

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #74 · **Área:** back office · **Milestone:** v0.4.0 · **Referências:** RF57

Termos, privacidade, trocas e garantia editáveis no back office.

Checklist “Critérios de aceite”:

- [ ] Admin edita sem deploy
- [ ] Páginas linkadas no footer e no checkout

#### AB-075 — LGPD: consentimento e direitos do titular

**Etiquetas:** P0 — MVP, Backend  
**Issue:** #75 · **Área:** back office · **Milestone:** v0.4.0 · **Referências:** RF56, RNF03

Banner de cookies, exportação e exclusão/anonimização de dados, com dados pessoais e financeiros protegidos em trânsito e em repouso.

Checklist “Critérios de aceite”:

- [ ] Cookies não essenciais só após consentimento
- [ ] Exportação de dados em formato legível
- [ ] Exclusão anonimiza sem quebrar pedidos e notas
- [ ] Dados pessoais sensíveis criptografados em repouso e acesso restrito por perfil

#### AB-076 — Log de auditoria de ações sensíveis

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #76 · **Área:** back office · **Milestone:** v0.4.0 · **Referências:** RNF12

Registro de aprovações, preços, crédito, estornos e perfis.

Checklist “Critérios de aceite”:

- [ ] Log com usuário, data/hora, IP e valores anterior e novo
- [ ] Log não editável pela interface

## Etapa 6 — Qualidade, Segurança e Lançamento

**Prazo:** Dia 5 (14/11/2026), entrega final · **Objetivo:** Testes, performance, acessibilidade, monitoramento e deploy.

**Critério para encerrar a etapa:** todos os cards P0 em Concluído e nenhum card bloqueado.

### Cards para colar

```
AB-020 — Auditoria de acessibilidade WCAG 2.1 AA
AB-031 — SEO técnico
AB-062 — Checklist PCI-DSS SAQ A
AB-077 — Testes automatizados e cobertura mínima
AB-078 — Orçamento de performance
AB-079 — Teste de carga
AB-080 — Monitoramento de disponibilidade e alertas
AB-081 — Backup e teste de restauração
AB-082 — Deploy e checklist de lançamento
```

### Detalhamento dos cards

#### AB-020 — Auditoria de acessibilidade WCAG 2.1 AA

**Etiquetas:** P1 — Importante, Design  
**Issue:** #20 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF13

Auditar as páginas principais com ferramenta automática e teste manual de teclado e leitor de tela.

Checklist “Critérios de aceite”:

- [ ] Nenhum erro crítico na ferramenta automática
- [ ] Fluxo de compra completo navegável só por teclado
- [ ] Imagens de produto com texto alternativo

#### AB-031 — SEO técnico

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #31 · **Área:** catálogo · **Milestone:** v1.0.0 · **Referências:** RNF14

URLs amigáveis, sitemap, metadados por página e dados estruturados de produto.

Checklist “Critérios de aceite”:

- [ ] Sitemap gerado automaticamente
- [ ] Title e description em todas as páginas públicas
- [ ] Schema Product validado sem erros

#### AB-062 — Checklist PCI-DSS SAQ A

**Etiquetas:** P1 — Importante, Backend  
**Issue:** #62 · **Área:** pagamento · **Milestone:** v1.0.0 · **Referências:** RN19

Verificar os requisitos mínimos do SAQ A para o checkout transparente.

Checklist “Critérios de aceite”:

- [ ] Checklist preenchido e versionado
- [ ] Pendências viram issues

#### AB-077 — Testes automatizados e cobertura mínima

**Etiquetas:** P0 — MVP, Infra/Qualidade, Backend  
**Issue:** #77 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF07

Testes unitários e de integração dos fluxos críticos (frete, estoque, pagamento, aprovação).

Checklist “Critérios de aceite”:

- [ ] Cobertura mínima definida e verificada no CI
- [ ] Fluxo de compra coberto por teste de ponta a ponta

#### AB-078 — Orçamento de performance

**Etiquetas:** P1 — Importante, Infra/Qualidade, Backend  
**Issue:** #78 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF10

Medir e otimizar LCP e tempo de resposta da API.

Checklist “Critérios de aceite”:

- [ ] LCP de até 2,5 s nas páginas de vitrine
- [ ] API com p95 de até 500 ms

#### AB-079 — Teste de carga

**Etiquetas:** P2 — Desejável, Infra/Qualidade, Backend  
**Issue:** #79 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF02

Simular 3x o tráfego médio esperado.

Checklist “Critérios de aceite”:

- [ ] Relatório do teste de carga
- [ ] Sem erros nem degradação acima do limite definido

#### AB-080 — Monitoramento de disponibilidade e alertas

**Etiquetas:** P1 — Importante, Infra/Qualidade, Backend  
**Issue:** #80 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF01, RNF16

Monitorar uptime e erros, com alertas para a equipe.

Checklist “Critérios de aceite”:

- [ ] Alerta disparado em queda
- [ ] Painel de disponibilidade
- [ ] Healthcheck e `restart: unless-stopped` em todos os containers

#### AB-081 — Backup e teste de restauração

**Etiquetas:** P1 — Importante, Infra/Qualidade, Backend  
**Issue:** #81 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF11, RNF16

Backup diário com retenção de 30 dias e restauração testada.

Checklist “Critérios de aceite”:

- [ ] Backup automático configurado
- [ ] Restauração testada e documentada dentro do RTO de 4 h
- [ ] Container `backup` com `mysqldump` diário em `./backups`, retenção de 30 dias e restauração documentada

#### AB-082 — Deploy e checklist de lançamento

**Etiquetas:** P0 — MVP, Infra/Qualidade  
**Issue:** #82 · **Área:** app · **Milestone:** v1.0.0 · **Referências:** RNF01, RNF06, RNF16

Subir o servidor local em Docker (app, MySQL, Caddy e backup), acessível pelos dispositivos da rede, e executar o checklist final.

Checklist “Critérios de aceite”:

- [ ] Site acessível via HTTPS por outro dispositivo da rede (IP fixo da máquina servidora)
- [ ] Checklist de lançamento concluído
- [ ] Apresentação final preparada
- [ ] `docker compose up -d` sobe o servidor local e `prisma migrate deploy` roda ao iniciar o app
- [ ] MySQL acessível pela rede só com usuário nomeado, restrito à sub-rede e com TLS; `root` sem acesso remoto
- [ ] Portas 80, 443 e 3306 liberadas no firewall só no perfil de rede Privada
