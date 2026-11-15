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
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
