-- AlterTable
ALTER TABLE "Shipment" ADD COLUMN "acidNumber" TEXT;

-- CreateTable
CREATE TABLE "DocumentType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ShipmentDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "shipmentId" INTEGER NOT NULL,
    "typeId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "content" BLOB NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShipmentDocument_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShipmentDocument_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "DocumentType" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentType_name_key" ON "DocumentType"("name");

-- CreateIndex
CREATE INDEX "ShipmentDocument_shipmentId_idx" ON "ShipmentDocument"("shipmentId");


-- The standard import documents; people add their own types from the shipment page.
INSERT INTO "DocumentType" ("name", "builtIn") VALUES
    ('Proforma Invoice', 1),
    ('Commercial Invoice', 1),
    ('Certificate of Origin (COO)', 1),
    ('Packing List', 1);
