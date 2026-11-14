-- AlterTable
ALTER TABLE `credit_limit_changes` ADD COLUMN `previous_status` ENUM('NONE', 'PENDING', 'APPROVED', 'REJECTED') NULL;

