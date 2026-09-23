-- DropIndex
DROP INDEX "Comment_githubId_key";

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "accountType" TEXT NOT NULL DEFAULT 'User',
ADD COLUMN     "profileSyncedAt" TIMESTAMP(3),
ALTER COLUMN "createdAt" DROP NOT NULL;

-- Existing comments: pull request review comments are the ones stored with a PR number
ALTER TABLE "Comment" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'issue_comment';
UPDATE "Comment" SET "kind" = 'review_comment' WHERE "prNumber" IS NOT NULL;
ALTER TABLE "Comment" ALTER COLUMN "kind" DROP DEFAULT;

-- Comments must belong to an existing repository
DELETE FROM "Comment"
WHERE "repositoryId" IS NULL
   OR "repositoryId" NOT IN (SELECT "id" FROM "Repository");

-- AlterTable
ALTER TABLE "Comment" ALTER COLUMN "githubId" SET DATA TYPE BIGINT,
ALTER COLUMN "repositoryId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Repository" ALTER COLUMN "githubId" SET DATA TYPE BIGINT;

-- CreateIndex
CREATE UNIQUE INDEX "Comment_kind_githubId_key" ON "Comment"("kind", "githubId");

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_repositoryId_fkey" FOREIGN KEY ("repositoryId") REFERENCES "Repository"("id") ON DELETE CASCADE ON UPDATE CASCADE;
