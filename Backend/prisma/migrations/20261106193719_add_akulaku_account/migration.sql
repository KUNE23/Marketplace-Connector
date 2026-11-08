-- CreateTable
CREATE TABLE "AkulakuAccount" (
    "id" BIGSERIAL NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "username" VARCHAR(150) NOT NULL,
    "passwordEnc" TEXT NOT NULL,
    "categoryId" BIGINT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "AkulakuAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AkulakuAccount_categoryId_key" ON "AkulakuAccount"("categoryId");

-- AddForeignKey
ALTER TABLE "AkulakuAccount" ADD CONSTRAINT "AkulakuAccount_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
