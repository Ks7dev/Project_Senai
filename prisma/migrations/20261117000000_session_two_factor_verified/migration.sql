-- AlterTable
ALTER TABLE `sessions` ADD COLUMN `two_factor_verified` BOOLEAN NOT NULL DEFAULT false;
