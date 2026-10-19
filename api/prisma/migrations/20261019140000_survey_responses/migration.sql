-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "language" TEXT NOT NULL,
    "tried" TEXT,
    "answers" JSONB NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "contactOk" BOOLEAN NOT NULL DEFAULT false,
    "nameOk" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SurveyResponse_createdAt_idx" ON "SurveyResponse"("createdAt");

