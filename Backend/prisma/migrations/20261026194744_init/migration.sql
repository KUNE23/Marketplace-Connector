-- CreateTable
CREATE TABLE "User" (
    "id" BIGSERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawShopee" (
    "id" BIGSERIAL NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RawShopee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldMap" (
    "shopeeKey" TEXT NOT NULL,
    "akulakuKey" TEXT NOT NULL,
    "transformJs" TEXT,

    CONSTRAINT "FieldMap_pkey" PRIMARY KEY ("shopeeKey")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" BIGSERIAL NOT NULL,
    "shopeeItemId" BIGINT,
    "sku" TEXT,
    "name" TEXT,
    "description" TEXT,
    "priceIdr" DECIMAL(65,30),
    "stock" INTEGER,
    "category" TEXT,
    "imageUrls" TEXT[],
    "lastSyncedAt" TIMESTAMPTZ,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" BIGSERIAL NOT NULL,
    "productId" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "runAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
