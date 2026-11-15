-- Encryption at rest of CPF and phone (RNF03, #75). The ciphertext of
-- AES-256-GCM in base64url is longer than the plain value; the app
-- encrypts the existing rows when it starts (encryptLegacyPersonalData).

-- AlterTable
ALTER TABLE `users` MODIFY `document` VARCHAR(80) NOT NULL,
    MODIFY `phone` VARCHAR(80) NULL;

-- AlterTable
ALTER TABLE `demo_requests` MODIFY `phone` VARCHAR(80) NULL;
