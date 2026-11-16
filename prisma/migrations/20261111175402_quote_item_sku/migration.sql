-- AlterTable
ALTER TABLE `quote_items` ADD COLUMN `sku_id` CHAR(36) NULL;

-- CreateIndex
CREATE INDEX `quote_items_sku_id_idx` ON `quote_items`(`sku_id`);

-- AddForeignKey
ALTER TABLE `quote_items` ADD CONSTRAINT `quote_items_sku_id_fkey` FOREIGN KEY (`sku_id`) REFERENCES `skus`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
