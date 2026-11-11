-- AlterTable
ALTER TABLE `payments` ADD COLUMN `boleto_line` VARCHAR(64) NULL,
    ADD COLUMN `pix_qr_code_image` MEDIUMTEXT NULL;
