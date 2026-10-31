-- AlterTable
ALTER TABLE "Lot" ADD COLUMN "manufactureDate" DATETIME;

-- AlterTable
ALTER TABLE "ShipmentLine" ADD COLUMN "manufactureDate" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ShipmentDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipmentId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BLOB NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shipmentLineId" INTEGER,
    CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ShipmentDocument_shipmentLineId_fkey" FOREIGN KEY ("shipmentLineId") REFERENCES "ShipmentLine" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ShipmentDocument" ("content", "fileName", "id", "mimeType", "shipmentId", "size", "typeId", "uploadedAt") SELECT "content", "fileName", "id", "mimeType", "shipmentId", "size", "typeId", "uploadedAt" FROM "ShipmentDocument";
DROP TABLE "ShipmentDocument";
ALTER TABLE "new_ShipmentDocument" RENAME TO "ShipmentDocument";
CREATE INDEX "ShipmentDocument_shipmentId_idx" ON "ShipmentDocument"("shipmentId");
CREATE INDEX "ShipmentDocument_shipmentLineId_idx" ON "ShipmentDocument"("shipmentLineId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

