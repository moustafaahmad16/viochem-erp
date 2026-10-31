-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "manufactureDate" DATE;

-- AlterTable
ALTER TABLE "ShipmentDocument" ADD COLUMN     "shipmentLineId" INTEGER;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN     "manufactureDate" DATE;

-- CreateIndex
CREATE INDEX "ShipmentDocument_shipmentLineId_idx" ON "ShipmentDocument"("shipmentLineId");

-- AddForeignKey
ALTER TABLE "ShipmentDocument" ADD CONSTRAINT "ShipmentDocument_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
