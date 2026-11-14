-- AlterTable
ALTER TABLE `users` ADD COLUMN `price_table_id` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `organizations` ADD COLUMN `price_table_id` CHAR(36) NULL;

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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `users_price_table_id_idx` ON `users`(`price_table_id`);

-- CreateIndex
CREATE INDEX `organizations_price_table_id_idx` ON `organizations`(`price_table_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organizations` ADD CONSTRAINT `organizations_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_table_items` ADD CONSTRAINT `price_table_items_price_table_id_fkey` FOREIGN KEY (`price_table_id`) REFERENCES `price_tables`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `price_table_items` ADD CONSTRAINT `price_table_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `volume_discounts` ADD CONSTRAINT `volume_discounts_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

