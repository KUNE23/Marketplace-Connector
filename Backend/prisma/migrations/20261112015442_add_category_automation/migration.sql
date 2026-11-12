-- Daftar kategori Akulaku (hasil scrape /goods/category/tree)
CREATE TABLE "AkulakuCategory" (
    "id" BIGSERIAL NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "akulakuId" VARCHAR(50),
    "level" INTEGER NOT NULL DEFAULT 1,
    "rootName" VARCHAR(150),
    "scrapedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AkulakuCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AkulakuCategory_path_key" ON "AkulakuCategory"("path");
CREATE INDEX "AkulakuCategory_rootName_idx" ON "AkulakuCategory"("rootName");
CREATE INDEX "AkulakuCategory_level_idx" ON "AkulakuCategory"("level");

-- Aturan pemetaan nama produk -> kategori Akulaku
CREATE TABLE "CategoryRule" (
    "id" BIGSERIAL NOT NULL,
    "keyword" VARCHAR(200) NOT NULL,
    "path" VARCHAR(500) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" VARCHAR(300),
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "CategoryRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CategoryRule_keyword_idx" ON "CategoryRule"("keyword");
CREATE INDEX "CategoryRule_priority_idx" ON "CategoryRule"("priority");
