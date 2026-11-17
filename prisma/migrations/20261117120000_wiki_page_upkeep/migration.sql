-- AlterEnum
ALTER TYPE "WikiLinkTargetKind" ADD VALUE 'list';

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "owner" TEXT,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WikiPageLink" DROP COLUMN "pageUpdatedAt";
