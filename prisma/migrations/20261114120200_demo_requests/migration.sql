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
    `phone` VARCHAR(20) NULL,
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

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `demo_requests` ADD CONSTRAINT `demo_requests_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

