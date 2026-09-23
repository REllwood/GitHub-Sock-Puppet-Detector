-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "activitySummary" JSONB;

-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "startedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "commentsSyncedAt" TIMESTAMP(3);

