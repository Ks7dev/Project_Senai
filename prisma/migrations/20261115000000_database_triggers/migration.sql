-- Database triggers (docs/banco-de-dados/05-gatilhos.md).
-- Prisma does not model triggers, so they live only in this migration.
-- They are a last line of defense: the Server Actions already enforce
-- the same rules, and the triggers stop a bug or a manual change from
-- breaking them. Errors use SQLSTATE 45000 with a short message.
-- Foreign key cascades (ON DELETE SET NULL / CASCADE) do not fire
-- triggers in MySQL, so deleting a user or an order keeps working.

-- Audit log is append-only (RNF12)
CREATE TRIGGER `trg_audit_logs_before_update`
BEFORE UPDATE ON `audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only: updates are not allowed';
END;

CREATE TRIGGER `trg_audit_logs_before_delete`
BEFORE DELETE ON `audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only: deletes are not allowed';
END;

-- Order status history is append-only (RF15, RF54)
CREATE TRIGGER `trg_order_status_history_before_update`
BEFORE UPDATE ON `order_status_history` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'order_status_history is append-only: updates are not allowed';
END;

CREATE TRIGGER `trg_order_status_history_before_delete`
BEFORE DELETE ON `order_status_history` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'order_status_history is append-only: deletes are not allowed';
END;

-- Stock movements are a ledger: a correction is a new movement (RF43)
CREATE TRIGGER `trg_stock_movements_before_update`
BEFORE UPDATE ON `stock_movements` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'stock_movements is a ledger: updates are not allowed';
END;

-- Stock never goes negative (RF43, RN14)
CREATE TRIGGER `trg_stock_before_insert`
BEFORE INSERT ON `stock` FOR EACH ROW
BEGIN
  IF NEW.`on_hand` < 0 OR NEW.`reserved` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'stock: on_hand and reserved must not be negative';
  END IF;
END;

CREATE TRIGGER `trg_stock_before_update`
BEFORE UPDATE ON `stock` FOR EACH ROW
BEGIN
  IF NEW.`on_hand` < 0 OR NEW.`reserved` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'stock: on_hand and reserved must not be negative';
  END IF;
END;

-- Order amounts are never negative
CREATE TRIGGER `trg_orders_before_insert`
BEFORE INSERT ON `orders` FOR EACH ROW
BEGIN
  IF NEW.`subtotal` < 0 OR NEW.`discount` < 0 OR NEW.`services_total` < 0
    OR NEW.`shipping_total` < 0 OR NEW.`total` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'orders: amounts must not be negative';
  END IF;
END;

CREATE TRIGGER `trg_orders_before_update`
BEFORE UPDATE ON `orders` FOR EACH ROW
BEGIN
  IF NEW.`subtotal` < 0 OR NEW.`discount` < 0 OR NEW.`services_total` < 0
    OR NEW.`shipping_total` < 0 OR NEW.`total` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'orders: amounts must not be negative';
  END IF;
END;

-- A payment never refunds more than it received (RF34, RN18)
CREATE TRIGGER `trg_payments_before_insert`
BEFORE INSERT ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`amount` < 0 OR NEW.`refunded_amount` < 0
    OR NEW.`refunded_amount` > NEW.`amount` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payments: refunded_amount must be between 0 and amount';
  END IF;
END;

CREATE TRIGGER `trg_payments_before_update`
BEFORE UPDATE ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`amount` < 0 OR NEW.`refunded_amount` < 0
    OR NEW.`refunded_amount` > NEW.`amount` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payments: refunded_amount must be between 0 and amount';
  END IF;
END;

-- A refund always moves a positive amount
CREATE TRIGGER `trg_refunds_before_insert`
BEFORE INSERT ON `refunds` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'refunds: amount must be positive';
  END IF;
END;

CREATE TRIGGER `trg_refunds_before_update`
BEFORE UPDATE ON `refunds` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'refunds: amount must be positive';
  END IF;
END;

-- An issued NF-e keeps its fiscal data (RF13)
CREATE TRIGGER `trg_invoices_before_update`
BEFORE UPDATE ON `invoices` FOR EACH ROW
BEGIN
  IF OLD.`status` = 'ISSUED' AND (
    NEW.`status` <> OLD.`status`
    OR NOT (NEW.`access_key` <=> OLD.`access_key`)
    OR NOT (NEW.`number` <=> OLD.`number`)
    OR NOT (NEW.`series` <=> OLD.`series`)
    OR NOT (NEW.`protocol` <=> OLD.`protocol`)
    OR NOT (NEW.`xml` <=> OLD.`xml`)
  ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'invoices: an issued NF-e cannot be changed';
  END IF;
END;

-- Discount percentages stay between 0 and 100 (RF21, RN04)
CREATE TRIGGER `trg_price_tables_before_insert`
BEFORE INSERT ON `price_tables` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_tables: discount_percent must be between 0 and 100';
  END IF;
END;

CREATE TRIGGER `trg_price_tables_before_update`
BEFORE UPDATE ON `price_tables` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_tables: discount_percent must be between 0 and 100';
  END IF;
END;

CREATE TRIGGER `trg_price_table_items_before_insert`
BEFORE INSERT ON `price_table_items` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_table_items: discount_percent must be between 0 and 100';
  END IF;
END;

CREATE TRIGGER `trg_price_table_items_before_update`
BEFORE UPDATE ON `price_table_items` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_table_items: discount_percent must be between 0 and 100';
  END IF;
END;

CREATE TRIGGER `trg_volume_discounts_before_insert`
BEFORE INSERT ON `volume_discounts` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'volume_discounts: discount_percent must be between 0 and 100';
  END IF;
END;

CREATE TRIGGER `trg_volume_discounts_before_update`
BEFORE UPDATE ON `volume_discounts` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'volume_discounts: discount_percent must be between 0 and 100';
  END IF;
END;
