-- AlterTable
ALTER TABLE "CustomerRequest" ADD COLUMN     "inboxId" TEXT,
ADD COLUMN     "sentBy" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CustomerRequest_inboxId_key" ON "CustomerRequest"("inboxId");
