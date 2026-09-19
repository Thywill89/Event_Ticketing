-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "accessToken" TEXT;

-- Backfill any existing rows (guest access tokens)
UPDATE "Order"
SET "accessToken" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
WHERE "accessToken" IS NULL;

-- Enforce required + unique
ALTER TABLE "Order" ALTER COLUMN "accessToken" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Order_accessToken_key" ON "Order"("accessToken");
CREATE INDEX IF NOT EXISTS "Order_reservedUntil_idx" ON "Order"("reservedUntil");
