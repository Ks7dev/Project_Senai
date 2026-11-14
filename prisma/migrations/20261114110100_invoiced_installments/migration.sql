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

-- AddForeignKey
ALTER TABLE `invoiced_installments` ADD CONSTRAINT `invoiced_installments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoiced_installments` ADD CONSTRAINT `invoiced_installments_settled_by_id_fkey` FOREIGN KEY (`settled_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

