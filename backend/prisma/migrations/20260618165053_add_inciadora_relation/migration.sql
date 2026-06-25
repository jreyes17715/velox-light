-- AlterTable
ALTER TABLE "users" ADD COLUMN     "inciadoraId" TEXT;

-- CreateIndex
CREATE INDEX "users_inciadoraId_idx" ON "users"("inciadoraId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_inciadoraId_fkey" FOREIGN KEY ("inciadoraId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
