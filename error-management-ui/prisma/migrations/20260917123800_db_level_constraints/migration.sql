-- Two constraints from docs/management-ui-architecture.md that Prisma schema syntax
-- cannot express (see the matching comments in prisma/schema.prisma) and so are hand-written
-- here rather than generated from the schema.

-- Exactly one production Environment per Application (docs/environments-and-promotion.md).
CREATE UNIQUE INDEX "Environment_applicationId_one_production_key"
  ON "Environment" ("applicationId")
  WHERE "isProduction";

-- Defense-in-depth for the promotion submitter-≠-approver rule (also enforced in the app
-- layer, in src/lib/services once promotion actions are implemented) — a reviewer can never
-- be the same user who submitted the request.
ALTER TABLE "PromotionRequest"
  ADD CONSTRAINT "PromotionRequest_submitter_not_reviewer_check"
  CHECK ("reviewedByUserId" IS NULL OR "reviewedByUserId" <> "submittedByUserId");

-- Prevents two concurrent promotion requests racing for the same target
-- (errorMessageId, language, targetEnvironmentId) while one is still pending.
CREATE UNIQUE INDEX "PromotionRequest_no_duplicate_pending_key"
  ON "PromotionRequest" ("errorMessageId", "language", "targetEnvironmentId")
  WHERE "status" = 'PENDING';
