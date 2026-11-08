-- CreateEnum
CREATE TYPE "DataViewVisibility" AS ENUM ('private', 'workspace', 'roles');

-- AlterTable
ALTER TABLE "DataView" ADD COLUMN     "visibility" "DataViewVisibility" NOT NULL DEFAULT 'private';

-- CreateTable
CREATE TABLE "DataViewRoleShare" (
    "viewId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataViewRoleShare_pkey" PRIMARY KEY ("viewId","roleId")
);

-- CreateTable
CREATE TABLE "DataViewHidden" (
    "viewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataViewHidden_pkey" PRIMARY KEY ("viewId","userId")
);

-- CreateIndex
CREATE INDEX "DataViewRoleShare_companyId_idx" ON "DataViewRoleShare"("companyId");

-- CreateIndex
CREATE INDEX "DataViewRoleShare_roleId_idx" ON "DataViewRoleShare"("roleId");

-- CreateIndex
CREATE INDEX "DataViewHidden_companyId_idx" ON "DataViewHidden"("companyId");

-- CreateIndex
CREATE INDEX "DataViewHidden_userId_idx" ON "DataViewHidden"("userId");

-- CreateIndex
CREATE INDEX "DataView_companyId_surfaceKey_visibility_idx" ON "DataView"("companyId", "surfaceKey", "visibility");

-- AddForeignKey
ALTER TABLE "DataViewRoleShare" ADD CONSTRAINT "DataViewRoleShare_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DataView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataViewRoleShare" ADD CONSTRAINT "DataViewRoleShare_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "UserRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataViewRoleShare" ADD CONSTRAINT "DataViewRoleShare_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataViewHidden" ADD CONSTRAINT "DataViewHidden_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DataView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataViewHidden" ADD CONSTRAINT "DataViewHidden_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataViewHidden" ADD CONSTRAINT "DataViewHidden_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

