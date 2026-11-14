-- CreateTable
CREATE TABLE `support_tickets` (
    `id` CHAR(36) NOT NULL,
    `number` VARCHAR(20) NOT NULL,
    `kind` ENUM('WARRANTY', 'TECHNICAL_ASSISTANCE') NOT NULL,
    `status` ENUM('OPEN', 'IN_ANALYSIS', 'WAITING_CUSTOMER', 'RESOLVED', 'DENIED') NOT NULL DEFAULT 'OPEN',
    `user_id` VARCHAR(36) NOT NULL,
    `organization_id` VARCHAR(36) NULL,
    `order_id` CHAR(36) NOT NULL,
    `order_item_id` CHAR(36) NOT NULL,
    `subject` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `resolution` TEXT NULL,
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

