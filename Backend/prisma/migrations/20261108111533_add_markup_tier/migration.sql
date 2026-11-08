-- CreateTable
CREATE TABLE "MarkupTier" (
    "id" BIGSERIAL NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "minPrice" DECIMAL(14,2) NOT NULL,
    "maxPrice" DECIMAL(14,2),
    "markupType" VARCHAR(10) NOT NULL DEFAULT 'percent',
    "markupValue" DECIMAL(14,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MarkupTier_pkey" PRIMARY KEY ("id")
);
