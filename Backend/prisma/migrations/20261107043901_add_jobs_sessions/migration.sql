-- CreateTable
CREATE TABLE "Job" (
    "id" BIGSERIAL NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "payload" JSONB,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "lastError" TEXT,
    "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkulakuSession" (
    "id" BIGSERIAL NOT NULL,
    "accountId" BIGINT NOT NULL,
    "stateEnc" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'missing',
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AkulakuSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "AkulakuSession_accountId_key" ON "AkulakuSession"("accountId");

-- AddForeignKey
ALTER TABLE "AkulakuSession" ADD CONSTRAINT "AkulakuSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
