-- CreateEnum
CREATE TYPE "MovementReason" AS ENUM ('PURCHASE', 'SALE', 'DEATH', 'LOST', 'CONSUMED', 'ADDED', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ChatMode" AS ENUM ('AGENT', 'CHAT');

-- AlterTable
ALTER TABLE "AIConversation" ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "LivestockMovement" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "livestockType" "LivestockType" NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" "MovementReason" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LivestockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mode" "ChatMode" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LivestockMovement_farmId_createdAt_idx" ON "LivestockMovement"("farmId", "createdAt");

-- CreateIndex
CREATE INDEX "LivestockMovement_farmId_reason_createdAt_idx" ON "LivestockMovement"("farmId", "reason", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_farmId_userId_updatedAt_idx" ON "ChatSession"("farmId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIConversation_sessionId_createdAt_idx" ON "AIConversation"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "LivestockMovement" ADD CONSTRAINT "LivestockMovement_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
