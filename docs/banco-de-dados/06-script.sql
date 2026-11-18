-- Atelier Bureau: script de criação do banco (MySQL 8.4)
-- Gerado por `npm run db:docs` a partir de prisma/schema.prisma e dos
-- gatilhos das migrations. Não edite à mão. No servidor, o banco é
-- criado pelas migrations (`prisma migrate deploy`); este script serve
-- para estudo, para o MySQL Workbench e para criar um banco avulso:
--   mysql -u root -p < docs/banco-de-dados/06-script.sql
-- Com binlog ligado, o usuário sem SUPER precisa de
-- log_bin_trust_function_creators=1 para criar os gatilhos.

CREATE DATABASE IF NOT EXISTS `atelier_bureau`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `atelier_bureau`;

-- ================================================================
-- Tabelas, índices e chaves estrangeiras
-- ================================================================
-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `email_verified` BOOLEAN NOT NULL DEFAULT false,
    `image` TEXT NULL,
    `two_factor_enabled` BOOLEAN NULL DEFAULT false,
    `person_type` ENUM('PF', 'PJ') NOT NULL,
    `document` VARCHAR(80) NOT NULL,
    `phone` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `price_table_id` CHAR(36) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    UNIQUE INDEX `users_document_key`(`document`),
    INDEX `users_price_table_id_idx`(`price_table_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` VARCHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` TEXT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `active_organization_id` VARCHAR(36) NULL,
    `two_factor_verified` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `sessions_token_key`(`token`),
    INDEX `sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `accounts` (
    `id` VARCHAR(36) NOT NULL,
    `account_id` VARCHAR(191) NOT NULL,
    `provider_id` VARCHAR(64) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `access_token` TEXT NULL,
    `refresh_token` TEXT NULL,
    `id_token` TEXT NULL,
    `access_token_expires_at` DATETIME(3) NULL,
    `refresh_token_expires_at` DATETIME(3) NULL,
    `scope` TEXT NULL,
    `password` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `accounts_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `verifications` (
    `id` VARCHAR(36) NOT NULL,
    `identifier` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `verifications_identifier_idx`(`identifier`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `two_factors` (
    `id` VARCHAR(36) NOT NULL,
    `secret` VARCHAR(191) NOT NULL,
    `backup_codes` TEXT NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `verified` BOOLEAN NULL DEFAULT true,
    `failed_verification_count` INTEGER NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,

    INDEX `two_factors_secret_idx`(`secret`),
    INDEX `two_factors_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `organizations` (
    `id` VARCHAR(36) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `logo` TEXT NULL,
    `metadata` TEXT NULL,
    `cnpj` VARCHAR(14) NULL,
    `legal_name` VARCHAR(191) NULL,
    `credit_status` ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'NONE',
    `credit_limit` DECIMAL(12, 2) NULL,
    `seller_id` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `price_table_id` CHAR(36) NULL,

    UNIQUE INDEX `organizations_slug_key`(`slug`),
    UNIQUE INDEX `organizations_cnpj_key`(`cnpj`),
    INDEX `organizations_seller_id_idx`(`seller_id`),
    INDEX `organizations_credit_status_idx`(`credit_status`),
    INDEX `organizations_price_table_id_idx`(`price_table_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `members` (
    `id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `role` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL,

    INDEX `members_user_id_idx`(`user_id`),
    UNIQUE INDEX `members_organization_id_user_id_key`(`organization_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `invitations` (
    `id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` VARCHAR(64) NULL,
    `status` VARCHAR(32) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `inviter_id` VARCHAR(36) NOT NULL,

    INDEX `invitations_organization_id_idx`(`organization_id`),
    INDEX `invitations_email_idx`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `key` VARCHAR(64) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` CHAR(36) NOT NULL,
    `resource` VARCHAR(64) NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `permissions_resource_action_key`(`resource`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` CHAR(36) NOT NULL,
    `permission_id` CHAR(36) NOT NULL,

    INDEX `role_permissions_permission_id_idx`(`permission_id`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` VARCHAR(36) NOT NULL,
    `role_id` CHAR(36) NOT NULL,

    INDEX `user_roles_role_id_idx`(`role_id`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` CHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `organization_id` VARCHAR(36) NULL,
    `label` VARCHAR(80) NOT NULL,
    `recipient` VARCHAR(160) NOT NULL,
    `cep` CHAR(8) NOT NULL,
    `street` VARCHAR(191) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `complement` VARCHAR(120) NULL,
    `district` VARCHAR(120) NOT NULL,
    `city` VARCHAR(120) NOT NULL,
    `state` CHAR(2) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `addresses_user_id_idx`(`user_id`),
    INDEX `addresses_organization_id_idx`(`organization_id`),
    INDEX `addresses_cep_idx`(`cep`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `name` VARCHAR(120) NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categories_slug_key`(`slug`),
    INDEX `categories_parent_id_position_idx`(`parent_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` CHAR(36) NOT NULL,
    `category_id` CHAR(36) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `brand` VARCHAR(120) NULL,
    `specs` JSON NULL,
    `base_price` DECIMAL(12, 2) NOT NULL,
    `weight_kg` DECIMAL(8, 3) NOT NULL,
    `length_cm` DECIMAL(8, 2) NOT NULL,
    `width_cm` DECIMAL(8, 2) NOT NULL,
    `height_cm` DECIMAL(8, 2) NOT NULL,
    `warranty_months` INTEGER NOT NULL DEFAULT 3,
    `includes_extended_warranty` BOOLEAN NOT NULL DEFAULT false,
    `requires_certification` BOOLEAN NOT NULL DEFAULT false,
    `requires_installation` BOOLEAN NOT NULL DEFAULT false,
    `personalizable` BOOLEAN NOT NULL DEFAULT false,
    `limited_edition` BOOLEAN NOT NULL DEFAULT false,
    `lot_number` VARCHAR(60) NULL,
    `lead_time_days` INTEGER NOT NULL DEFAULT 5,
    `status` ENUM('DRAFT', 'ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'DRAFT',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    INDEX `products_category_id_status_idx`(`category_id`, `status`),
    INDEX `products_status_base_price_idx`(`status`, `base_price`),
    INDEX `products_brand_idx`(`brand`),
    FULLTEXT INDEX `products_name_description_idx`(`name`, `description`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `alt` VARCHAR(191) NOT NULL,
    `position` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_images_product_id_position_idx`(`product_id`, `position`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `product_documents` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `kind` ENUM('DATASHEET', 'CERTIFICATION', 'MANUAL') NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_documents_product_id_kind_idx`(`product_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `skus` (
    `id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `attributes` JSON NULL,
    `price` DECIMAL(12, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `skus_code_key`(`code`),
    INDEX `skus_product_id_idx`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock` (
    `sku_id` CHAR(36) NOT NULL,
    `on_hand` INTEGER NOT NULL DEFAULT 0,
    `reserved` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`sku_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `stock_movements` (
    `id` CHAR(36) NOT NULL,
    `sku_id` CHAR(36) NOT NULL,
    `type` ENUM('RESERVE', 'RELEASE', 'WRITE_OFF', 'RESTOCK', 'ADJUSTMENT') NOT NULL,
    `quantity` INTEGER NOT NULL,
    `order_id` CHAR(36) NULL,
    `user_id` VARCHAR(36) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `stock_movements_sku_id_created_at_idx`(`sku_id`, `created_at`),
    INDEX `stock_movements_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `carts` (
    `id` CHAR(36) NOT NULL,
    `kind` ENUM('CART', 'PROJECT_LIST') NOT NULL DEFAULT 'CART',
    `name` VARCHAR(120) NULL,
    `user_id` VARCHAR(36) NULL,
    `organization_id` VARCHAR(36) NULL,
    `guest_token` VARCHAR(64) NULL,
    `coupon_code` VARCHAR(40) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `carts_guest_token_key`(`guest_token`),
    INDEX `carts_user_id_kind_idx`(`user_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `cart_items` (
    `id` CHAR(36) NOT NULL,
    `cart_id` CHAR(36) NOT NULL,
    `sku_id` CHAR(36) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `personalization` JSON NULL,
    `services` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cart_items_sku_id_idx`(`sku_id`),
    UNIQUE INDEX `cart_items_cart_id_sku_id_key`(`cart_id`, `sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `quotes` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NULL,
    `status` ENUM('REQUESTED', 'IN_REVIEW', 'ANSWERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED') NOT NULL DEFAULT 'REQUESTED',
    `notes` TEXT NULL,
    `valid_until` DATETIME(3) NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `answer_note` TEXT NULL,
    `answered_by_id` VARCHAR(36) NULL,
    `answered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `quotes_number_key`(`number`),
    INDEX `quotes_status_valid_until_idx`(`status`, `valid_until`),
    INDEX `quotes_user_id_idx`(`user_id`),
    INDEX `quotes_organization_id_idx`(`organization_id`),
    INDEX `quotes_answered_by_id_idx`(`answered_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `quote_items` (
    `id` CHAR(36) NOT NULL,
    `quote_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `sku_id` CHAR(36) NULL,
    `description` VARCHAR(255) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(12, 2) NULL,

    INDEX `quote_items_quote_id_idx`(`quote_id`),
    INDEX `quote_items_product_id_idx`(`product_id`),
    INDEX `quote_items_sku_id_idx`(`sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `quote_attachments` (
    `id` CHAR(36) NOT NULL,
    `quote_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `quote_attachments_quote_id_idx`(`quote_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NULL,
    `quote_id` CHAR(36) NULL,
    `status` ENUM('AWAITING_APPROVAL', 'AWAITING_SHIPPING_QUOTE', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SEPARATING', 'INVOICED', 'SHIPPED', 'DELIVERED', 'INSTALLED', 'CANCELED', 'REFUNDED') NOT NULL,
    `payment_method` ENUM('CARD', 'PIX', 'BOLETO', 'INVOICED') NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `discount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `services_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `shipping_total` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `total` DECIMAL(12, 2) NOT NULL,
    `coupon_code` VARCHAR(40) NULL,
    `applied_promotions` JSON NULL,
    `shipping_address` JSON NOT NULL,
    `scheduled_delivery_at` DATETIME(3) NULL,
    `extra_lead_business_days` INTEGER NOT NULL DEFAULT 0,
    `requires_approval` BOOLEAN NOT NULL DEFAULT false,
    `approved_by_id` VARCHAR(36) NULL,
    `approved_at` DATETIME(3) NULL,
    `approval_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_number_key`(`number`),
    INDEX `orders_status_created_at_idx`(`status`, `created_at`),
    INDEX `orders_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `orders_organization_id_status_idx`(`organization_id`, `status`),
    INDEX `orders_scheduled_delivery_at_idx`(`scheduled_delivery_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `sku_id` CHAR(36) NOT NULL,
    `product_name` VARCHAR(191) NOT NULL,
    `sku_code` VARCHAR(64) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unit_price` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `personalization` JSON NULL,
    `services` JSON NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_sku_id_idx`(`sku_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `order_status_history` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `from_status` ENUM('AWAITING_APPROVAL', 'AWAITING_SHIPPING_QUOTE', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SEPARATING', 'INVOICED', 'SHIPPED', 'DELIVERED', 'INSTALLED', 'CANCELED', 'REFUNDED') NULL,
    `to_status` ENUM('AWAITING_APPROVAL', 'AWAITING_SHIPPING_QUOTE', 'AWAITING_PAYMENT', 'PAID', 'IN_PRODUCTION', 'SEPARATING', 'INVOICED', 'SHIPPED', 'DELIVERED', 'INSTALLED', 'CANCELED', 'REFUNDED') NOT NULL,
    `changed_by_id` VARCHAR(36) NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_status_history_order_id_created_at_idx`(`order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `order_approvals` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `decision` ENUM('APPROVED', 'REJECTED') NOT NULL,
    `decided_by_id` VARCHAR(36) NOT NULL,
    `note` TEXT NULL,
    `order_total` DECIMAL(12, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_approvals_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `order_approvals_decided_by_id_idx`(`decided_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `method` ENUM('CARD', 'PIX', 'BOLETO', 'INVOICED') NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED') NOT NULL DEFAULT 'PENDING',
    `payment_id` VARCHAR(64) NULL,
    `provider_status` VARCHAR(64) NULL,
    `status_detail` VARCHAR(64) NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `refunded_amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `installments` INTEGER NOT NULL DEFAULT 1,
    `expires_at` DATETIME(3) NULL,
    `pix_qr_code` TEXT NULL,
    `pix_qr_code_image` MEDIUMTEXT NULL,
    `boleto_url` TEXT NULL,
    `boleto_line` VARCHAR(64) NULL,
    `paid_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_payment_id_key`(`payment_id`),
    INDEX `payments_order_id_idx`(`order_id`),
    INDEX `payments_status_expires_at_idx`(`status`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `refunds` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `payment_row_id` CHAR(36) NULL,
    `kind` ENUM('FULL', 'PARTIAL') NOT NULL,
    `reason` ENUM('CANCELLATION', 'WITHDRAWAL', 'EVALUATED_RETURN', 'ADJUSTMENT') NOT NULL,
    `channel` ENUM('MERCADO_PAGO', 'MANUAL_TRANSFER') NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `status` ENUM('PENDING_APPROVAL', 'PROCESSING', 'COMPLETED', 'FAILED', 'REJECTED') NOT NULL,
    `provider_refund_id` VARCHAR(64) NULL,
    `note` VARCHAR(500) NOT NULL,
    `failure_reason` VARCHAR(255) NULL,
    `requested_by_id` VARCHAR(36) NOT NULL,
    `decided_by_id` VARCHAR(36) NULL,
    `decided_at` DATETIME(3) NULL,
    `decision_note` VARCHAR(255) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `refunds_provider_refund_id_key`(`provider_refund_id`),
    INDEX `refunds_order_id_created_at_idx`(`order_id`, `created_at`),
    INDEX `refunds_status_created_at_idx`(`status`, `created_at`),
    INDEX `refunds_payment_row_id_idx`(`payment_row_id`),
    INDEX `refunds_requested_by_id_idx`(`requested_by_id`),
    INDEX `refunds_decided_by_id_idx`(`decided_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `invoiced_installments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `due_days` INTEGER NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL,
    `due_date` DATETIME(3) NOT NULL,
    `status` ENUM('OPEN', 'PAID', 'CANCELED') NOT NULL DEFAULT 'OPEN',
    `boleto_number` VARCHAR(20) NOT NULL,
    `digitable_line` VARCHAR(64) NOT NULL,
    `paid_at` DATETIME(3) NULL,
    `paid_amount` DECIMAL(12, 2) NULL,
    `settled_by_id` VARCHAR(36) NULL,
    `settlement_method` ENUM('MANUAL', 'BANK_RETURN') NULL,
    `settlement_note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoiced_installments_boleto_number_key`(`boleto_number`),
    INDEX `invoiced_installments_status_due_date_idx`(`status`, `due_date`),
    INDEX `invoiced_installments_settled_by_id_idx`(`settled_by_id`),
    UNIQUE INDEX `invoiced_installments_order_id_sequence_key`(`order_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `invoices` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `status` ENUM('PENDING', 'PROCESSING', 'ISSUED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `access_key` CHAR(44) NULL,
    `number` VARCHAR(20) NULL,
    `series` VARCHAR(5) NULL,
    `protocol` VARCHAR(64) NULL,
    `xml` MEDIUMTEXT NULL,
    `danfe_key` VARCHAR(255) NULL,
    `submitted_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `last_error` VARCHAR(500) NULL,
    `next_attempt_at` DATETIME(3) NULL,
    `alerted_at` DATETIME(3) NULL,
    `issued_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `invoices_order_id_key`(`order_id`),
    UNIQUE INDEX `invoices_access_key_key`(`access_key`),
    INDEX `invoices_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `payment_notifications` (
    `id` CHAR(36) NOT NULL,
    `request_id` VARCHAR(128) NOT NULL,
    `topic` VARCHAR(40) NOT NULL,
    `resource_id` VARCHAR(64) NOT NULL,
    `received_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `processed_at` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `payment_notifications_request_id_key`(`request_id`),
    INDEX `payment_notifications_resource_id_idx`(`resource_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `shipments` (
    `id` CHAR(36) NOT NULL,
    `order_id` CHAR(36) NOT NULL,
    `method` ENUM('CORREIOS_PAC', 'CORREIOS_SEDEX', 'CARRIER', 'OWN_DELIVERY', 'MANUAL_QUOTE') NOT NULL,
    `carrier` VARCHAR(120) NULL,
    `service` VARCHAR(120) NULL,
    `price` DECIMAL(12, 2) NOT NULL,
    `delivery_days` INTEGER NULL,
    `tracking_code` VARCHAR(64) NULL,
    `quote_data` JSON NULL,
    `shipped_at` DATETIME(3) NULL,
    `delivered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `shipments_order_id_key`(`order_id`),
    INDEX `shipments_tracking_code_idx`(`tracking_code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `shipping_regions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `cep_start` CHAR(8) NOT NULL,
    `cep_end` CHAR(8) NOT NULL,
    `own_delivery` BOOLEAN NOT NULL DEFAULT false,
    `own_delivery_rates` JSON NULL,
    `free_shipping_minimum` DECIMAL(12, 2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `shipping_regions_cep_start_cep_end_idx`(`cep_start`, `cep_end`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `promotions` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `scope` ENUM('PRODUCT', 'CATEGORY', 'COUPON') NOT NULL,
    `product_id` CHAR(36) NULL,
    `category_id` CHAR(36) NULL,
    `coupon_code` VARCHAR(40) NULL,
    `discount_type` ENUM('PERCENT', 'FIXED') NOT NULL,
    `discount_value` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `free_shipping` BOOLEAN NOT NULL DEFAULT false,
    `min_order_total` DECIMAL(12, 2) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `promotions_coupon_code_key`(`coupon_code`),
    INDEX `promotions_active_starts_at_ends_at_idx`(`active`, `starts_at`, `ends_at`),
    INDEX `promotions_product_id_idx`(`product_id`),
    INDEX `promotions_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `price_tables` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `description` VARCHAR(255) NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL DEFAULT 0,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `price_tables_active_deleted_at_idx`(`active`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `price_table_items` (
    `id` CHAR(36) NOT NULL,
    `price_table_id` CHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `price_table_items_product_id_idx`(`product_id`),
    UNIQUE INDEX `price_table_items_price_table_id_product_id_key`(`price_table_id`, `product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `volume_discounts` (
    `id` CHAR(36) NOT NULL,
    `category_id` CHAR(36) NOT NULL,
    `min_quantity` INTEGER NULL,
    `min_amount` DECIMAL(12, 2) NULL,
    `discount_percent` DECIMAL(5, 2) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `volume_discounts_category_id_active_idx`(`category_id`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `settings` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NOT NULL,
    `description` VARCHAR(255) NOT NULL,
    `updated_by_id` VARCHAR(36) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `settings_updated_by_id_idx`(`updated_by_id`),
    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `institutional_pages` (
    `slug` VARCHAR(80) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `body` MEDIUMTEXT NOT NULL,
    `updated_by_id` VARCHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `institutional_pages_updated_by_id_idx`(`updated_by_id`),
    PRIMARY KEY (`slug`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` CHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NULL,
    `action` VARCHAR(100) NOT NULL,
    `entity` VARCHAR(64) NOT NULL,
    `entity_id` VARCHAR(36) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip_address` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_entity_id_idx`(`entity`, `entity_id`),
    INDEX `audit_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `audit_logs_action_created_at_idx`(`action`, `created_at`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `key_hash` CHAR(64) NOT NULL,
    `window_start` DATETIME(3) NOT NULL,
    `scope` VARCHAR(32) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key_hash`, `window_start`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `favorites` (
    `user_id` VARCHAR(36) NOT NULL,
    `product_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `favorites_product_id_idx`(`product_id`),
    PRIMARY KEY (`user_id`, `product_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `credit_limit_changes` (
    `id` CHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NOT NULL,
    `previous_limit` DECIMAL(12, 2) NULL,
    `new_limit` DECIMAL(12, 2) NULL,
    `previous_status` ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED') NULL,
    `status` ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED') NOT NULL,
    `changed_by_id` VARCHAR(36) NOT NULL,
    `note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `credit_limit_changes_organization_id_created_at_idx`(`organization_id`, `created_at`),
    INDEX `credit_limit_changes_changed_by_id_idx`(`changed_by_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `kind` ENUM('WARRANTY', 'TECHNICAL_ASSISTANCE', 'EXCHANGE', 'RETURN', 'WITHDRAWAL') NOT NULL,
    `status` ENUM('OPEN', 'IN_ANALYSIS', 'WAITING_CUSTOMER', 'RESOLVED', 'DENIED') NOT NULL DEFAULT 'OPEN',
    `user_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NULL,
    `order_id` CHAR(36) NOT NULL,
    `order_item_id` CHAR(36) NOT NULL,
    `subject` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `resolution` TEXT NULL,
    `return_reason` ENUM('DEFECT', 'TRANSPORT_DAMAGE', 'WRONG_ITEM', 'NOT_AS_EXPECTED', 'OTHER') NULL,
    `return_outcome` ENUM('EXCHANGE', 'REPAIR', 'REFUND') NULL,
    `personalized` BOOLEAN NOT NULL DEFAULT false,
    `legal_review` BOOLEAN NOT NULL DEFAULT false,
    `closed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `support_tickets_number_key`(`number`),
    INDEX `support_tickets_status_created_at_idx`(`status`, `created_at`),
    INDEX `support_tickets_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `support_tickets_organization_id_created_at_idx`(`organization_id`, `created_at`),
    INDEX `support_tickets_order_id_idx`(`order_id`),
    INDEX `support_tickets_order_item_id_idx`(`order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `support_ticket_events` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `from_status` ENUM('OPEN', 'IN_ANALYSIS', 'WAITING_CUSTOMER', 'RESOLVED', 'DENIED') NULL,
    `to_status` ENUM('OPEN', 'IN_ANALYSIS', 'WAITING_CUSTOMER', 'RESOLVED', 'DENIED') NULL,
    `message` TEXT NULL,
    `author_id` VARCHAR(36) NULL,
    `from_team` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_ticket_events_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
    INDEX `support_ticket_events_author_id_idx`(`author_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `support_ticket_attachments` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `mime_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `storage_key` VARCHAR(255) NOT NULL,
    `from_team` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `support_ticket_attachments_ticket_id_idx`(`ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `seller_rules` (
    `id` CHAR(36) NOT NULL,
    `seller_id` VARCHAR(36) NOT NULL,
    `person_type` ENUM('PF', 'PJ') NULL,
    `state` CHAR(2) NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `seller_rules_active_person_type_state_idx`(`active`, `person_type`, `state`),
    INDEX `seller_rules_seller_id_idx`(`seller_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `demo_requests` (
    `id` CHAR(36) NOT NULL,
    `user_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NULL,
    `product_id` CHAR(36) NULL,
    `seller_id` VARCHAR(36) NULL,
    `mode` ENUM('SHOWROOM', 'ONLINE', 'ON_SITE') NOT NULL,
    `scheduled_at` DATETIME(3) NOT NULL,
    `status` ENUM('REQUESTED', 'CONFIRMED', 'CANCELED', 'DONE') NOT NULL DEFAULT 'REQUESTED',
    `phone` VARCHAR(80) NULL,
    `notes` TEXT NULL,
    `team_note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `demo_requests_scheduled_at_status_idx`(`scheduled_at`, `status`),
    INDEX `demo_requests_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `demo_requests_organization_id_idx`(`organization_id`),
    INDEX `demo_requests_product_id_idx`(`product_id`),
    INDEX `demo_requests_seller_id_scheduled_at_idx`(`seller_id`, `scheduled_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- CreateTable
CREATE TABLE `email_outbox` (
    `id` CHAR(36) NOT NULL,
    `template` VARCHAR(64) NOT NULL,
    `recipient` VARCHAR(191) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `text` TEXT NOT NULL,
    `html` MEDIUMTEXT NOT NULL,
    `status` ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `next_attempt_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_error` VARCHAR(120) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `email_outbox_status_next_attempt_at_idx`(`status`, `next_attempt_at`),
    INDEX `email_outbox_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `two_factors` ADD CONSTRAINT `two_factors_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `members` ADD CONSTRAINT `members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitations` ADD CONSTRAINT `invitations_inviter_id_fkey` FOREIGN KEY (`inviter_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_documents` ADD CONSTRAINT `product_documents_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `skus` ADD CONSTRAINT `skus_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock` ADD CONSTRAINT `stock_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `carts` ADD CONSTRAINT `carts_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cart_id_fkey` FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_answered_by_id_fkey` FOREIGN KEY (`answered_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `quote_attachments` ADD CONSTRAINT `quote_attachments_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_quote_id_fkey` FOREIGN KEY (`quote_id`) REFERENCES `quotes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_approved_by_id_fkey` FOREIGN KEY (`approved_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_status_history` ADD CONSTRAINT `order_status_history_changed_by_id_fkey` FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_approvals` ADD CONSTRAINT `order_approvals_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_approvals` ADD CONSTRAINT `order_approvals_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_row_id_fkey` FOREIGN KEY (`payment_row_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoiced_installments` ADD CONSTRAINT `invoiced_installments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoiced_installments` ADD CONSTRAINT `invoiced_installments_settled_by_id_fkey` FOREIGN KEY (`settled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `shipments` ADD CONSTRAINT `shipments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_table_items` ADD CONSTRAINT `price_table_items_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_table_items` ADD CONSTRAINT `price_table_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volume_discounts` ADD CONSTRAINT `volume_discounts_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `settings` ADD CONSTRAINT `settings_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `institutional_pages` ADD CONSTRAINT `institutional_pages_updated_by_id_fkey` FOREIGN KEY (`updated_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `favorites` ADD CONSTRAINT `favorites_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_limit_changes` ADD CONSTRAINT `credit_limit_changes_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `credit_limit_changes` ADD CONSTRAINT `credit_limit_changes_changed_by_id_fkey` FOREIGN KEY (`changed_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_tickets` ADD CONSTRAINT `support_tickets_order_item_id_fkey` FOREIGN KEY (`order_item_id`) REFERENCES `order_items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_events` ADD CONSTRAINT `support_ticket_events_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_events` ADD CONSTRAINT `support_ticket_events_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `support_ticket_attachments` ADD CONSTRAINT `support_ticket_attachments_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seller_rules` ADD CONSTRAINT `seller_rules_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- ================================================================
-- Gatilhos (docs/banco-de-dados/05-gatilhos.md)
-- ================================================================
DELIMITER $$

CREATE TRIGGER `trg_audit_logs_before_update`
BEFORE UPDATE ON `audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only: updates are not allowed';
END$$

CREATE TRIGGER `trg_audit_logs_before_delete`
BEFORE DELETE ON `audit_logs` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'audit_logs is append-only: deletes are not allowed';
END$$

CREATE TRIGGER `trg_order_status_history_before_update`
BEFORE UPDATE ON `order_status_history` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'order_status_history is append-only: updates are not allowed';
END$$

CREATE TRIGGER `trg_order_status_history_before_delete`
BEFORE DELETE ON `order_status_history` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'order_status_history is append-only: deletes are not allowed';
END$$

CREATE TRIGGER `trg_stock_movements_before_update`
BEFORE UPDATE ON `stock_movements` FOR EACH ROW
BEGIN
  SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'stock_movements is a ledger: updates are not allowed';
END$$

CREATE TRIGGER `trg_stock_before_insert`
BEFORE INSERT ON `stock` FOR EACH ROW
BEGIN
  IF NEW.`on_hand` < 0 OR NEW.`reserved` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'stock: on_hand and reserved must not be negative';
  END IF;
END$$

CREATE TRIGGER `trg_stock_before_update`
BEFORE UPDATE ON `stock` FOR EACH ROW
BEGIN
  IF NEW.`on_hand` < 0 OR NEW.`reserved` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'stock: on_hand and reserved must not be negative';
  END IF;
END$$

CREATE TRIGGER `trg_orders_before_insert`
BEFORE INSERT ON `orders` FOR EACH ROW
BEGIN
  IF NEW.`subtotal` < 0 OR NEW.`discount` < 0 OR NEW.`services_total` < 0
    OR NEW.`shipping_total` < 0 OR NEW.`total` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'orders: amounts must not be negative';
  END IF;
END$$

CREATE TRIGGER `trg_orders_before_update`
BEFORE UPDATE ON `orders` FOR EACH ROW
BEGIN
  IF NEW.`subtotal` < 0 OR NEW.`discount` < 0 OR NEW.`services_total` < 0
    OR NEW.`shipping_total` < 0 OR NEW.`total` < 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'orders: amounts must not be negative';
  END IF;
END$$

CREATE TRIGGER `trg_payments_before_insert`
BEFORE INSERT ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`amount` < 0 OR NEW.`refunded_amount` < 0
    OR NEW.`refunded_amount` > NEW.`amount` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payments: refunded_amount must be between 0 and amount';
  END IF;
END$$

CREATE TRIGGER `trg_payments_before_update`
BEFORE UPDATE ON `payments` FOR EACH ROW
BEGIN
  IF NEW.`amount` < 0 OR NEW.`refunded_amount` < 0
    OR NEW.`refunded_amount` > NEW.`amount` THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'payments: refunded_amount must be between 0 and amount';
  END IF;
END$$

CREATE TRIGGER `trg_refunds_before_insert`
BEFORE INSERT ON `refunds` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'refunds: amount must be positive';
  END IF;
END$$

CREATE TRIGGER `trg_refunds_before_update`
BEFORE UPDATE ON `refunds` FOR EACH ROW
BEGIN
  IF NEW.`amount` <= 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'refunds: amount must be positive';
  END IF;
END$$

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
END$$

CREATE TRIGGER `trg_price_tables_before_insert`
BEFORE INSERT ON `price_tables` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_tables: discount_percent must be between 0 and 100';
  END IF;
END$$

CREATE TRIGGER `trg_price_tables_before_update`
BEFORE UPDATE ON `price_tables` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_tables: discount_percent must be between 0 and 100';
  END IF;
END$$

CREATE TRIGGER `trg_price_table_items_before_insert`
BEFORE INSERT ON `price_table_items` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_table_items: discount_percent must be between 0 and 100';
  END IF;
END$$

CREATE TRIGGER `trg_price_table_items_before_update`
BEFORE UPDATE ON `price_table_items` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'price_table_items: discount_percent must be between 0 and 100';
  END IF;
END$$

CREATE TRIGGER `trg_volume_discounts_before_insert`
BEFORE INSERT ON `volume_discounts` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'volume_discounts: discount_percent must be between 0 and 100';
  END IF;
END$$

CREATE TRIGGER `trg_volume_discounts_before_update`
BEFORE UPDATE ON `volume_discounts` FOR EACH ROW
BEGIN
  IF NEW.`discount_percent` < 0 OR NEW.`discount_percent` > 100 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'volume_discounts: discount_percent must be between 0 and 100';
  END IF;
END$$

DELIMITER ;
