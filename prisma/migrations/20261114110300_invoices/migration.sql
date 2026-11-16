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

-- AddForeignKey
ALTER TABLE `invoices` ADD CONSTRAINT `invoices_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
