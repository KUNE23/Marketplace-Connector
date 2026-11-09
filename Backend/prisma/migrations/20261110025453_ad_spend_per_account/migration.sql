ALTER TABLE "AdSpend" ADD COLUMN "accountId" BIGINT;

CREATE INDEX "AdSpend_accountId_idx" ON "AdSpend"("accountId");

ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
