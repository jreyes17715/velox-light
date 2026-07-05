-- CreateTable
CREATE TABLE "diqs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "registeredById" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "targetConsultoras" INTEGER NOT NULL DEFAULT 24,
    "targetProduccion" DECIMAL(18,2) NOT NULL DEFAULT 300000,
    "targetIniciaciones" INTEGER NOT NULL DEFAULT 8,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "diqs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "diqs_userId_key" ON "diqs"("userId");

-- CreateIndex
CREATE INDEX "diqs_userId_idx" ON "diqs"("userId");

-- CreateIndex
CREATE INDEX "diqs_registeredById_idx" ON "diqs"("registeredById");

-- CreateIndex
CREATE INDEX "diqs_status_idx" ON "diqs"("status");

-- AddForeignKey
ALTER TABLE "diqs" ADD CONSTRAINT "diqs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "diqs" ADD CONSTRAINT "diqs_registeredById_fkey" FOREIGN KEY ("registeredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
