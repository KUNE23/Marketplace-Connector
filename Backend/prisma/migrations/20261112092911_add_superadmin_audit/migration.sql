-- Role SUPERADMIN: tidak ada perubahan struktur User (role = String),
-- cukup pastikan nilai 'SUPERADMIN' diterima aplikasi.

-- Audit trail aktivitas user.
CREATE TABLE "AuditLog" (
    "id" BIGSERIAL NOT NULL,
    "userId" BIGINT,
    "userEmail" VARCHAR(200),
    "userRole" VARCHAR(30),
    "action" VARCHAR(100) NOT NULL,
    "resource" VARCHAR(100),
    "resourceId" VARCHAR(100),
    "status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "ip" VARCHAR(60),
    "userAgent" VARCHAR(300),
    "detail" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_resource_idx" ON "AuditLog"("resource");

-- Metrik request HTTP untuk halaman Monitor.
CREATE TABLE "RequestMetric" (
    "id" BIGSERIAL NOT NULL,
    "method" VARCHAR(10) NOT NULL,
    "path" VARCHAR(200) NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "userId" BIGINT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RequestMetric_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RequestMetric_createdAt_idx" ON "RequestMetric"("createdAt");
CREATE INDEX "RequestMetric_path_idx" ON "RequestMetric"("path");
CREATE INDEX "RequestMetric_statusCode_idx" ON "RequestMetric"("statusCode");
