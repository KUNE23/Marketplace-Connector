-- Kepemilikan akun Akulaku oleh user (pegawai/admin).
ALTER TABLE "AkulakuAccount" ADD COLUMN "ownerId" BIGINT;

CREATE INDEX "AkulakuAccount_ownerId_idx" ON "AkulakuAccount"("ownerId");

ALTER TABLE "AkulakuAccount"
  ADD CONSTRAINT "AkulakuAccount_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Catatan pelanggaran toko Akulaku.
CREATE TABLE "Violation" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "violationKey" VARCHAR(150) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(150),
    "note" VARCHAR(500),
    "score" INTEGER,
    "penalty" DECIMAL(14,2),
    "count" INTEGER,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "periodStart" TIMESTAMPTZ,
    "periodEnd" TIMESTAMPTZ,
    "rawPayload" JSONB,
    "detectedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "Violation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Violation_accountId_violationKey_key" ON "Violation"("accountId", "violationKey");
CREATE INDEX "Violation_accountId_idx" ON "Violation"("accountId");
CREATE INDEX "Violation_detectedAt_idx" ON "Violation"("detectedAt");

ALTER TABLE "Violation"
  ADD CONSTRAINT "Violation_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Snapshot ringkasan kondisi toko per akun.
CREATE TABLE "ViolationSummary" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "shopScore" INTEGER,
    "totalScore" INTEGER,
    "totalPenalty" DECIMAL(14,2),
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "condition" VARCHAR(100),
    "assessmentCycle" VARCHAR(100),
    "rawPayload" JSONB,
    "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ViolationSummary_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ViolationSummary_accountId_capturedAt_idx" ON "ViolationSummary"("accountId", "capturedAt");

ALTER TABLE "ViolationSummary"
  ADD CONSTRAINT "ViolationSummary_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: akun lama dipegang admin pertama (agar tetap terlihat & tidak "yatim").
UPDATE "AkulakuAccount"
SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' ORDER BY "id" ASC LIMIT 1)
WHERE "ownerId" IS NULL;
