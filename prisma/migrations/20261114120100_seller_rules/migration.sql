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

-- AddForeignKey
ALTER TABLE `seller_rules` ADD CONSTRAINT `seller_rules_seller_id_fkey` FOREIGN KEY (`seller_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

