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

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_payment_row_id_fkey` FOREIGN KEY (`payment_row_id`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_requested_by_id_fkey` FOREIGN KEY (`requested_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
