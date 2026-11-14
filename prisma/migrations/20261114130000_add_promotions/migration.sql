-- AlterTable
ALTER TABLE `carts` ADD COLUMN `coupon_code` VARCHAR(40) NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `applied_promotions` JSON NULL,
    ADD COLUMN `coupon_code` VARCHAR(40) NULL;

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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promotions` ADD CONSTRAINT `promotions_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

