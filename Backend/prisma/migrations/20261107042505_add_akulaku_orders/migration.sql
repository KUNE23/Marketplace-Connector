-- CreateTable
CREATE TABLE "AkulakuOrder" (
    "id" BIGSERIAL NOT NULL,
    "externalId" VARCHAR(150) NOT NULL,
    "accountId" BIGINT NOT NULL,
    "buyerName" VARCHAR(150),
    "buyerPhone" VARCHAR(50),
    "shippingAddress" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'new',
    "totalAmt" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'IDR',
    "orderedAt" TIMESTAMPTZ NOT NULL,
    "syncedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "rawPayload" JSONB,

    CONSTRAINT "AkulakuOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AkulakuOrderItem" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT NOT NULL,
    "listingId" BIGINT,
    "sku" VARCHAR(150),
    "name" VARCHAR(255),
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(14,2) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "AkulakuOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AkulakuOrder_externalId_key" ON "AkulakuOrder"("externalId");

-- AddForeignKey
ALTER TABLE "AkulakuOrder" ADD CONSTRAINT "AkulakuOrder_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "AkulakuAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkulakuOrderItem" ADD CONSTRAINT "AkulakuOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "AkulakuOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AkulakuOrderItem" ADD CONSTRAINT "AkulakuOrderItem_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
