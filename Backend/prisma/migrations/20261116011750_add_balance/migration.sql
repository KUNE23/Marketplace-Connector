-- Saldo akun Akulaku (kondisi terkini) + riwayat snapshot.
CREATE TABLE "AkulakuBalance" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "available" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "pending" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'IDR',
    "note" VARCHAR(300),
    "rawPayload" JSONB,
    "lastSyncedAt" TIMESTAMPTZ,
    "syncError" VARCHAR(500),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "AkulakuBalance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AkulakuBalance_accountId_key" ON "AkulakuBalance"("accountId");

ALTER TABLE "AkulakuBalance"
  ADD CONSTRAINT "AkulakuBalance_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "BalanceSnapshot" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "available" DECIMAL(16,2) NOT NULL,
    "pending" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(16,2) NOT NULL,
    "capturedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BalanceSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BalanceSnapshot_accountId_capturedAt_idx" ON "BalanceSnapshot"("accountId", "capturedAt");

ALTER TABLE "BalanceSnapshot"
  ADD CONSTRAINT "BalanceSnapshot_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
