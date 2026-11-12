-- Ekstraksi data pesanan Akulaku dari rawPayload.
ALTER TABLE "AkulakuOrderItem"
  ADD COLUMN "imageUrl" VARCHAR(500),
  ADD COLUMN "variant" VARCHAR(200);

CREATE TABLE "AkulakuOrderExtra" (
    "id" BIGSERIAL NOT NULL,
    "orderId" BIGINT NOT NULL,
    "payType" INTEGER,
    "payTypeLabel" VARCHAR(50),
    "orderCode" VARCHAR(100),
    "orderType" INTEGER,
    "refundStatus" INTEGER,
    "deliveryStatus" INTEGER,
    "isCod" BOOLEAN NOT NULL DEFAULT false,
    "payTime" TIMESTAMPTZ,
    "createTime" TIMESTAMPTZ,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "AkulakuOrderExtra_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AkulakuOrderExtra_orderId_key" ON "AkulakuOrderExtra"("orderId");

ALTER TABLE "AkulakuOrderExtra"
  ADD CONSTRAINT "AkulakuOrderExtra_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "AkulakuOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
