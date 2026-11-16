-- AlterTable
ALTER TABLE `quotes` ADD COLUMN `answer_note` TEXT NULL,
    ADD COLUMN `answered_at` DATETIME(3) NULL,
    ADD COLUMN `answered_by_id` VARCHAR(36) NULL;

-- CreateIndex
CREATE INDEX `quotes_answered_by_id_idx` ON `quotes`(`answered_by_id`);

-- AddForeignKey
ALTER TABLE `quotes` ADD CONSTRAINT `quotes_answered_by_id_fkey` FOREIGN KEY (`answered_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
