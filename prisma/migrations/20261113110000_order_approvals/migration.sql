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

-- AddForeignKey
ALTER TABLE `order_approvals` ADD CONSTRAINT `order_approvals_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_approvals` ADD CONSTRAINT `order_approvals_decided_by_id_fkey` FOREIGN KEY (`decided_by_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
