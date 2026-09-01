-- CreateTable
CREATE TABLE "unit_targets" (
    "id" TEXT NOT NULL,
    "directoraId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "targetAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'DOP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unit_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_targets_directoraId_idx" ON "unit_targets"("directoraId");

-- CreateIndex
CREATE UNIQUE INDEX "unit_targets_directoraId_month_year_key" ON "unit_targets"("directoraId", "month", "year");

-- AddForeignKey
ALTER TABLE "unit_targets" ADD CONSTRAINT "unit_targets_directoraId_fkey" FOREIGN KEY ("directoraId") REFERENCES "users"("sapUserId") ON DELETE RESTRICT ON UPDATE CASCADE;
