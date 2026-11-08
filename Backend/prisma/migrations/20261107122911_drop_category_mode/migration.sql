-- DropForeignKey
ALTER TABLE "AkulakuAccount" DROP CONSTRAINT "AkulakuAccount_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "MarkupRule" DROP CONSTRAINT "MarkupRule_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_categoryId_fkey";

-- AlterTable
ALTER TABLE "AkulakuAccount" DROP COLUMN "categoryId";

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "categoryId",
ADD COLUMN     "location" TEXT,
ADD COLUMN     "rating" DECIMAL(3,2),
ADD COLUMN     "shopId" TEXT,
ADD COLUMN     "shopeeUrl" TEXT,
ADD COLUMN     "sold" INTEGER;

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "MarkupRule";

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopeeItemId_key" ON "Product"("shopeeItemId");
