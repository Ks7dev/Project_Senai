# Atelier Bureau — Escopo do banco de dados

Este documento define o que o banco do Atelier Bureau guarda, o que fica fora dele e as regras que valem para todas as tabelas. Ele atende à issue #8 e ao RNF16. O detalhe técnico está no [DER](02-der.md), no [MER](03-mer.md), no [dicionário de dados](04-dicionario-de-dados.md), nos [gatilhos](05-gatilhos.md) e no [script SQL](06-script.sql).

## 1. Objetivo

Guardar, com integridade e rastreabilidade, os dados do e-commerce híbrido B2B + B2C:

- catálogo;
- contas PF e PJ;
- carrinho, cotação, pedido e pagamento;
- logística, nota fiscal e pós-venda;
- configuração das regras de negócio e auditoria das ações sensíveis.

O banco é a única fonte de verdade desses dados. A aplicação chega a ele só pelo Prisma, dentro de Server Actions que checam a permissão do usuário da sessão.

## 2. Tecnologia e convenções

| Item | Decisão |
|---|---|
| SGBD | MySQL 8.4 (imagem `mysql:8.4` do Docker), motor InnoDB (RNF16) |
| Charset e collation | `utf8mb4` e `utf8mb4_0900_ai_ci` em todas as tabelas; comparações ignoram acento e caixa |
| Fuso | Servidor em `+00:00`; datas em `DATETIME(3)`, sempre em UTC, convertidas para o horário de Brasília só na tela |
| Dinheiro | `DECIMAL(12,2)`, nunca `FLOAT`; percentuais em `DECIMAL(5,2)` |
| Identificadores | UUID v7 em `CHAR(36)` nas tabelas do domínio; `VARCHAR(36)` nas tabelas do Better Auth (usuário, sessão, conta corporativa) |
| Nomes | Tabelas e colunas em inglês e `snake_case`; no código, `camelCase` via `@map` e `@@map` |
| Schema | `prisma/schema.prisma` é a fonte da verdade; toda mudança entra por migration versionada (`prisma/migrations`) |
| Exclusão | Exclusão feita pelo usuário é lógica (`deleted_at`) em `users`, `organizations`, `addresses`, `products`, `carts`, `price_tables`, `volume_discounts` e `promotions` |
| Cópias congeladas | Pedido e item do pedido copiam endereço, nome, código e preço no momento da compra (`shipping_address`, `product_name`, `sku_code`, `unit_price`, `applied_promotions`), para que edições posteriores não mudem o histórico |

## 3. O que o banco guarda

O modelo tem 52 tabelas em 7 domínios. A lista completa, com as colunas, está no [dicionário de dados](04-dicionario-de-dados.md).

| Domínio | Tabelas | Requisitos |
|---|---|---|
| Acesso, contas e perfis | `users`, `sessions`, `accounts`, `verifications`, `two_factors`, `organizations`, `members`, `invitations`, `roles`, `permissions`, `role_permissions`, `user_roles`, `addresses` | RF09, RF10, RF22, RF26, RF39, RF40, RF55, RN08 |
| Catálogo e estoque | `categories`, `products`, `product_images`, `product_documents`, `skus`, `stock`, `stock_movements`, `favorites` | RF01, RF03, RF41 a RF45, RN06, RN09, RN14 |
| Carrinho, cotação, preços e promoções | `carts`, `cart_items`, `quotes`, `quote_items`, `quote_attachments`, `price_tables`, `price_table_items`, `volume_discounts`, `promotions` | RF05 a RF08, RF20, RF21, RF46, RF51, RF52, RN02, RN04, RN23 |
| Pedidos e logística | `orders`, `order_items`, `order_status_history`, `order_approvals`, `shipments`, `shipping_regions` | RF11, RF15, RF16, RF25, RF27, RF49, RF50, RF54, RN01, RN05, RN15, RN16, RN20 |
| Financeiro e fiscal | `payments`, `payment_notifications`, `refunds`, `invoiced_installments`, `invoices`, `credit_limit_changes` | RF12, RF13, RF29 a RF34, RF58, RN03, RN07, RN10, RN13, RN17, RN18 |
| Pós-venda e atendimento | `support_tickets`, `support_ticket_events`, `support_ticket_attachments`, `seller_rules`, `demo_requests` | RF17, RF18, RF19, RN11, RN12, RN22, RN24 |
| Plataforma e auditoria | `settings`, `institutional_pages`, `audit_logs`, `email_outbox`, `rate_limit_buckets` | RF53, RF56, RF57, RNF05, RNF12 |

### 3.1 Configuração das regras de negócio

Os valores configuráveis das regras de negócio ficam na tabela `settings`, carregados pelo `prisma/seed.ts`. Hoje, só `payment.installment_rules` (`/admin/parcelamento`) e `content.home` (conteúdo da home) são editáveis no back office; as demais chaves mudam pelo seed. As chaves atuais são:

| Grupo | Chaves |
|---|---|
| Pedido e garantia | `order.approval_limit` (RN01) e `product.extended_warranty_threshold` (RN06) |
| Pagamento | `payment.pix_expiration_minutes`, `payment.boleto_expiration_business_days` (RN14), `payment.installment_rules` (RF14) e `payment.invoiced_due_days` (RN03) |
| Cotação | `quote.validity_days` (RN02) |
| Frete | `shipping.correios_max_weight_kg`, `shipping.correios_max_side_cm`, `shipping.correios_max_dimensions_sum_cm`, `shipping.cubage_factor`, `shipping.origin_cep` e `shipping.manual_quote_response_business_days` (RN20) |
| Estorno | `refund.withdrawal_days` (RN22) e `refund.max_days_after_payment` (RN18) |
| NF-e | `invoice.issuer` e `invoice.nfe_defaults` (RF13) |
| Carrinho | `personalization.engraving` (RF51) e `cart.additional_services` (RF52) |
| Instalação | `installation.min_business_days`, `installation.window_days`, `installation.daily_capacity`, `installation.weekdays` e `installation.blocked_dates` (RF16, RN05) |
| Demonstração | `demo.min_business_days`, `demo.window_days`, `demo.weekdays`, `demo.time_slots`, `demo.slot_capacity` e `demo.blocked_dates` (RF19) |
| Segurança | `security.payment_attempts_per_order`, `security.payment_attempts_per_ip` e `security.refund_requests_per_user` (rate limit das actions de pagamento e estorno, RNF05, #175) |
| Conteúdo | `content.home` (carrossel da home, RF47). Não vem do seed: o código usa um conteúdo padrão até o administrador salvar a primeira versão |

As faixas de CEP da entrega própria (RN16) e o mínimo de frete grátis por região (RN23) ficam em `shipping_regions`, que também é editável no back office.

## 4. O que fica fora do banco

| Dado | Onde fica | Motivo |
|---|---|---|
| Dados de cartão (número, CVV, validade) | Só no Mercado Pago, tokenizados no navegador | RN19, PCI-DSS SAQ A. O banco guarda só `payment_id`, status e valores |
| Senha em texto | Em lugar nenhum | Só o hash fica em `accounts.password` (RF40) |
| Imagens, PDFs e anexos | Disco local do servidor (`storage/`, volume do container `app`), via `features/shared/lib/storage/storage.ts` | O banco guarda só a chave (`storage_key`), o nome, o tipo e o tamanho |
| PDF do DANFE e boleto | Emissor fiscal e Mercado Pago | O banco guarda a chave de acesso, o XML e o link |
| Segredos de integração e chave de criptografia (`DATA_ENCRYPTION_KEY`) | `.env` do servidor | Nunca no banco nem no repositório |
| Métricas e logs de aplicação | Saída do container | O banco guarda só a auditoria de negócio (`audit_logs`) |

## 5. Integridade

- **Chaves estrangeiras:** são 79, todas explícitas. A regra ao excluir segue o papel da tabela:
  - `RESTRICT` protege o que é financeiro, fiscal ou de atendimento: pagamento, estorno, parcela faturada, NF-e e chamado. Um pedido com essas linhas não pode ser apagado.
  - `CASCADE` apaga os filhos que não existem sem o pai: item do pedido, histórico de status, aprovação, envio, item do carrinho e imagem do produto.
  - `SET NULL` preserva o registro quando o autor some: log de auditoria, movimento de estoque e quem alterou uma configuração.
- **Unicidade:** e-mail e CPF/CNPJ do usuário, CNPJ da conta corporativa, código do SKU, slug do produto e da categoria, número do pedido, da cotação e do chamado, `payment_id`, id do estorno no Mercado Pago, chave de acesso da NF-e, cupom e `x-request-id` do webhook (idempotência, RF30).
- **Índices:** 174 no total, contando as chaves primárias. Cobrem as colunas de filtro (status, datas, conta corporativa, categoria) e há um `FULLTEXT` para a busca do catálogo.
- **Gatilhos:** 20 gatilhos funcionam como última linha de defesa. Eles tornam imutáveis a auditoria, o histórico de status, o razão de estoque e a NF-e emitida, e recusam valores impossíveis: estoque negativo, estorno maior que o pago e desconto fora de 0 a 100%. Estão descritos em [gatilhos](05-gatilhos.md).
- **Concorrência:** a reserva de estoque usa `SELECT ... FOR UPDATE` dentro de `prisma.$transaction`, e toda operação em mais de uma tabela (pedido, estoque, aprovação, estorno) roda numa transação só.

## 6. Usuários do banco e privilégios

| Usuário | Privilégios | Uso |
|---|---|---|
| `atelier_app` | `SELECT`, `INSERT`, `UPDATE` e `DELETE` no schema `atelier_bureau` | Aplicação. Não tem DDL e não passa por cima dos gatilhos |
| `atelier_migrate` | Todos no schema e no banco sombra | `prisma migrate deploy` ao subir o container e `prisma migrate dev` em desenvolvimento |
| `atelier_backup` | Leitura, `SHOW VIEW`, `TRIGGER`, `LOCK TABLES` e `EVENT` | Dump diário (RNF11) |
| `dev` (opcional) | DML, só da sub-rede e com TLS | Acesso de desenvolvedor pela rede local |
| `root` | Total, sem acesso remoto | Administração dentro do container |

Os usuários são criados por `deploy/mysql/init/01-users.sh` no primeiro start do volume. O MySQL roda com `log_bin_trust_function_creators=1` para que o `atelier_migrate`, que não tem `SUPER`, consiga criar os gatilhos com o binlog ligado.

## 7. Dados pessoais (LGPD)

- **Onde estão:**
  - nome, e-mail, documento e telefone em `users`;
  - endereços em `addresses` e a cópia de entrega em `orders.shipping_address`;
  - IP e navegador em `sessions` e `audit_logs`;
  - textos livres em cotações e chamados.
- **Direitos do titular (RF56):** a exportação e a anonimização ficam na área do cliente (#75). A anonimização preserva pedidos, notas e pagamentos, que têm guarda obrigatória.
- **Criptografia em repouso (RNF03):** o CPF/CNPJ (`users.document`) e os telefones (`users.phone` e `demo_requests.phone`) são gravados cifrados com AES-256-GCM pela aplicação. A chave fica só na variável `DATA_ENCRYPTION_KEY` do `.env` do servidor, nunca no banco nem no backup.
  - O vetor de inicialização é derivado do próprio valor (HMAC), então o mesmo CPF gera sempre o mesmo texto cifrado. Assim o índice `UNIQUE` e a busca por CPF continuam funcionando.
  - Ao subir, a aplicação cifra as linhas antigas que ainda estiverem em texto (`encryptLegacyPersonalData`). O CPF fictício de uma conta anonimizada (iniciado por `X`) não é dado pessoal e fica como está.
  - Sem a chave, os CPFs e telefones não podem ser lidos. Guarde uma cópia dela fora do servidor, junto com o plano de restauração do backup.

## 8. Backup e recuperação

O serviço `backup` do Docker faz um dump diário com retenção de 30 dias (RNF11: RPO de 24 h e RTO de 4 h). O dump leva os gatilhos (privilégio `TRIGGER` do `atelier_backup`), então a restauração recria o banco completo.

## 9. Fora do escopo desta versão

- Réplica de leitura, particionamento e arquivamento de tabelas grandes. O volume esperado no projeto acadêmico não justifica.
- Procedures e views. A regra de negócio fica nas Server Actions, e o banco só garante a integridade.
- Expurgo automático da auditoria. O `audit_logs` não aceita `DELETE`, e um expurgo por prazo de retenção depende de uma decisão de LGPD.
