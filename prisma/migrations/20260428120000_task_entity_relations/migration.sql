-- CreateTable
CREATE TABLE "TaskContact" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "TaskContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOrganization" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "TaskOrganization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskDeal" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "TaskDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskService" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "companyId" TEXT NOT NULL,

    CONSTRAINT "TaskService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskContact_taskId_idx" ON "TaskContact"("taskId");

-- CreateIndex
CREATE INDEX "TaskContact_contactId_idx" ON "TaskContact"("contactId");

-- CreateIndex
CREATE INDEX "TaskContact_companyId_idx" ON "TaskContact"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskContact_taskId_contactId_key" ON "TaskContact"("taskId", "contactId");

-- CreateIndex
CREATE INDEX "TaskOrganization_taskId_idx" ON "TaskOrganization"("taskId");

-- CreateIndex
CREATE INDEX "TaskOrganization_organizationId_idx" ON "TaskOrganization"("organizationId");

-- CreateIndex
CREATE INDEX "TaskOrganization_companyId_idx" ON "TaskOrganization"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOrganization_taskId_organizationId_key" ON "TaskOrganization"("taskId", "organizationId");

-- CreateIndex
CREATE INDEX "TaskDeal_taskId_idx" ON "TaskDeal"("taskId");

-- CreateIndex
CREATE INDEX "TaskDeal_dealId_idx" ON "TaskDeal"("dealId");

-- CreateIndex
CREATE INDEX "TaskDeal_companyId_idx" ON "TaskDeal"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskDeal_taskId_dealId_key" ON "TaskDeal"("taskId", "dealId");

-- CreateIndex
CREATE INDEX "TaskService_taskId_idx" ON "TaskService"("taskId");

-- CreateIndex
CREATE INDEX "TaskService_serviceId_idx" ON "TaskService"("serviceId");

-- CreateIndex
CREATE INDEX "TaskService_companyId_idx" ON "TaskService"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskService_taskId_serviceId_key" ON "TaskService"("taskId", "serviceId");

-- AddForeignKey
ALTER TABLE "TaskContact" ADD CONSTRAINT "TaskContact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskContact" ADD CONSTRAINT "TaskContact_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskContact" ADD CONSTRAINT "TaskContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrganization" ADD CONSTRAINT "TaskOrganization_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrganization" ADD CONSTRAINT "TaskOrganization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOrganization" ADD CONSTRAINT "TaskOrganization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDeal" ADD CONSTRAINT "TaskDeal_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDeal" ADD CONSTRAINT "TaskDeal_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDeal" ADD CONSTRAINT "TaskDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskService" ADD CONSTRAINT "TaskService_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskService" ADD CONSTRAINT "TaskService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskService" ADD CONSTRAINT "TaskService_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
