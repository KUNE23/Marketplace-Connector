CREATE TABLE "AdSpend" (
    "id" BIGSERIAL NOT NULL,
    "period" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdSpend_period_idx" ON "AdSpend"("period");
