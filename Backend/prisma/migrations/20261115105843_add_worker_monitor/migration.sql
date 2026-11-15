-- Pemantauan worker: detak jantung + catatan aktivitas.
CREATE TABLE "WorkerHeartbeat" (
    "id" BIGSERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "pid" INTEGER,
    "hostname" VARCHAR(150),
    "status" VARCHAR(20) NOT NULL DEFAULT 'idle',
    "currentJob" BIGINT,
    "polls" INTEGER NOT NULL DEFAULT 0,
    "jobsDone" INTEGER NOT NULL DEFAULT 0,
    "jobsFailed" INTEGER NOT NULL DEFAULT 0,
    "version" VARCHAR(50),
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_name_key" ON "WorkerHeartbeat"("name");

CREATE TABLE "WorkerLog" (
    "id" BIGSERIAL NOT NULL,
    "worker" VARCHAR(50) NOT NULL DEFAULT 'worker',
    "level" VARCHAR(10) NOT NULL DEFAULT 'info',
    "message" VARCHAR(1000) NOT NULL,
    "jobId" BIGINT,
    "jobType" VARCHAR(50),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkerLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkerLog_createdAt_idx" ON "WorkerLog"("createdAt");
CREATE INDEX "WorkerLog_worker_idx" ON "WorkerLog"("worker");
CREATE INDEX "WorkerLog_level_idx" ON "WorkerLog"("level");
