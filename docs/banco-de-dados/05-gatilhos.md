# Atelier Bureau — Gatilhos (triggers)

Os gatilhos ficam na migration [`20261115000000_database_triggers`](../../prisma/migrations/20261115000000_database_triggers/migration.sql). O Prisma não modela gatilhos, então eles vivem só nas migrations e no [script SQL](06-script.sql).

## Papel dos gatilhos

As Server Actions já aplicam todas estas regras. Os gatilhos são a **última linha de defesa**: eles barram um bug ou uma alteração manual que tente quebrá-las, mesmo vindo do usuário da aplicação (`atelier_app`), que tem `UPDATE` e `DELETE` nas tabelas.

Por isso, eles só **recusam** operações. Nenhum gatilho grava dados por conta própria, para não duplicar a lógica das actions, como o histórico de status, que a action grava com o autor e a observação.

Toda recusa usa `SIGNAL SQLSTATE '45000'` com uma mensagem curta em inglês. A action captura o erro e mostra ao usuário uma mensagem genérica, sem detalhe interno (RNF05).

As ações de chave estrangeira (`ON DELETE CASCADE` e `SET NULL`) **não disparam gatilhos** no MySQL. Apagar um pedido apaga o histórico de status por cascata, e apagar um usuário zera o autor no log de auditoria, sem esbarrar nos gatilhos.

## Lista

| Tabela | Gatilho | Momento | Regra | Requisito |
|---|---|---|---|---|
| `audit_logs` | `trg_audit_logs_before_update` | BEFORE UPDATE | O log de auditoria só aceita inclusão | RNF12 |
| `audit_logs` | `trg_audit_logs_before_delete` | BEFORE DELETE | O log de auditoria não pode ser apagado | RNF12 |
| `order_status_history` | `trg_order_status_history_before_update` | BEFORE UPDATE | O histórico de status só aceita inclusão | RF15, RF54 |
| `order_status_history` | `trg_order_status_history_before_delete` | BEFORE DELETE | O histórico só sai junto com o pedido (cascata) | RF15, RF54 |
| `stock_movements` | `trg_stock_movements_before_update` | BEFORE UPDATE | O razão de estoque não é editado; a correção é um novo movimento | RF43 |
| `stock` | `trg_stock_before_insert`, `trg_stock_before_update` | BEFORE INSERT/UPDATE | `on_hand` e `reserved` nunca ficam negativos | RF43, RN14 |
| `orders` | `trg_orders_before_insert`, `trg_orders_before_update` | BEFORE INSERT/UPDATE | Subtotal, desconto, serviços, frete e total nunca negativos | RF54 |
| `payments` | `trg_payments_before_insert`, `trg_payments_before_update` | BEFORE INSERT/UPDATE | `refunded_amount` entre 0 e `amount`: nunca se estorna mais do que foi pago | RF34, RN18 |
| `refunds` | `trg_refunds_before_insert`, `trg_refunds_before_update` | BEFORE INSERT/UPDATE | O valor do estorno é sempre positivo | RF34 |
| `invoices` | `trg_invoices_before_update` | BEFORE UPDATE | Com a NF-e emitida (`ISSUED`), status, chave de acesso, número, série, protocolo e XML não mudam; campos de controle, como `alerted_at`, continuam editáveis | RF13 |
| `price_tables` | `trg_price_tables_before_insert`, `trg_price_tables_before_update` | BEFORE INSERT/UPDATE | Desconto entre 0 e 100% | RF21 |
| `price_table_items` | `trg_price_table_items_before_insert`, `trg_price_table_items_before_update` | BEFORE INSERT/UPDATE | Desconto entre 0 e 100% | RF21 |
| `volume_discounts` | `trg_volume_discounts_before_insert`, `trg_volume_discounts_before_update` | BEFORE INSERT/UPDATE | Desconto entre 0 e 100% | RN04 |

São 20 gatilhos em 10 tabelas.

## Exemplo

```sql
CREATE TRIGGER `trg_payments_before_update`
BEFORE UPDATE ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`amount` < 0 OR NEW.`refunded_amount` < 0
    OR NEW.`refunded_amount` > NEW.`amount` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payments: refunded_amount must be between 0 and amount';
  END IF;
END;
```

Na migration, cada gatilho termina em `END;`, porque o Prisma envia o arquivo inteiro de uma vez. No [script SQL](06-script.sql), eles vêm entre `DELIMITER $$` e `DELIMITER ;`, como o cliente `mysql` e o MySQL Workbench exigem.

## Privilégio para criar

Com o binlog ligado (padrão do MySQL 8), um usuário sem `SUPER` só cria gatilhos com `log_bin_trust_function_creators=1`. O `docker-compose.yml` já passa essa opção ao MySQL. Sem ela, o `prisma migrate deploy` do `atelier_migrate` falha com *"You do not have the SUPER privilege and binary logging is enabled"*.

No MySQL de desenvolvimento fora do Docker Compose, rode uma vez como `root`:

```sql
SET PERSIST log_bin_trust_function_creators = 1;
```

## Testes

O arquivo [`tests/integration/database-triggers.test.ts`](../../tests/integration/database-triggers.test.ts) tenta cada operação proibida contra o MySQL e confere a recusa. As sondagens rodam numa transação desfeita no fim, então não deixam linhas para trás. Ele roda com o resto da suíte em `npm run test:integration`.

## Consequências

- **Testes de integração:** não apagam mais linhas de `audit_logs`, porque o gatilho recusa. A limpeza apaga os pedidos e deixa a auditoria.
- **Expurgo por retenção (LGPD):** um expurgo futuro do `audit_logs` precisa de uma migration que troque o gatilho de `DELETE` por uma regra de prazo. Hoje nenhum prazo foi definido.
- **Correção manual:** um ajuste direto no banco que esbarre num gatilho deve virar uma operação da aplicação, como um movimento de ajuste de estoque ou um estorno, e não uma remoção do gatilho.
