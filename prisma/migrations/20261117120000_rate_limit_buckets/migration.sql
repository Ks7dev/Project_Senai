-- CreateTable
CREATE TABLE `rate_limit_buckets` (
    `key_hash` CHAR(64) NOT NULL,
    `window_start` DATETIME(3) NOT NULL,
    `scope` VARCHAR(32) NOT NULL,
    `hits` INTEGER NOT NULL DEFAULT 0,
    `expires_at` DATETIME(3) NOT NULL,

    INDEX `rate_limit_buckets_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`key_hash`, `window_start`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
