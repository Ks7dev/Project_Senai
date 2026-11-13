-- The payment_notifications table was created with utf8mb4_unicode_ci;
-- every other table uses utf8mb4_0900_ai_ci (ARCHITECTURE.md section 5).
ALTER TABLE `payment_notifications` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
