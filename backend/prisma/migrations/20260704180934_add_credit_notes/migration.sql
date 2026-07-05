-- CreateTable
CREATE TABLE "credit_notes" (
    "id" TEXT NOT NULL,
    "sapDocEntry" TEXT NOT NULL,
    "sapDocNum" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DOP',
    "docDate" TIMESTAMP(3) NOT NULL,
    "comments" TEXT,
    "ncfRef" TEXT,
    "ncfNC" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_notes_sapDocEntry_key" ON "credit_notes"("sapDocEntry");

-- CreateIndex
CREATE INDEX "credit_notes_userId_idx" ON "credit_notes"("userId");

-- CreateIndex
CREATE INDEX "credit_notes_docDate_idx" ON "credit_notes"("docDate");

-- AddForeignKey
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("sapUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
