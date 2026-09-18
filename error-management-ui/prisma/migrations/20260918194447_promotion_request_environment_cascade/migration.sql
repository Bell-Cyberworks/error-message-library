-- DropForeignKey
ALTER TABLE "PromotionRequest" DROP CONSTRAINT "PromotionRequest_sourceEnvironmentId_fkey";

-- DropForeignKey
ALTER TABLE "PromotionRequest" DROP CONSTRAINT "PromotionRequest_targetEnvironmentId_fkey";

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_sourceEnvironmentId_fkey" FOREIGN KEY ("sourceEnvironmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionRequest" ADD CONSTRAINT "PromotionRequest_targetEnvironmentId_fkey" FOREIGN KEY ("targetEnvironmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
