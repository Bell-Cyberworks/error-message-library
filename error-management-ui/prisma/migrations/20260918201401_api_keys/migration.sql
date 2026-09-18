-- CreateTable
CREATE TABLE "ApplicationApiKey" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApplicationApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "SystemApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApplicationApiKey_keyPrefix_idx" ON "ApplicationApiKey"("keyPrefix");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationApiKey_applicationId_name_key" ON "ApplicationApiKey"("applicationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "SystemApiKey_name_key" ON "SystemApiKey"("name");

-- CreateIndex
CREATE INDEX "SystemApiKey_keyPrefix_idx" ON "SystemApiKey"("keyPrefix");

-- AddForeignKey
ALTER TABLE "ApplicationApiKey" ADD CONSTRAINT "ApplicationApiKey_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationApiKey" ADD CONSTRAINT "ApplicationApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemApiKey" ADD CONSTRAINT "SystemApiKey_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
