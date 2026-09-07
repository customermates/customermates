-- Grouping indexes, additive only. Every one of these serves a query the grouping engine
-- issues and nothing else drops.
--
-- Join models: the relation axis counts with a tenant-scoped groupBy over the join table,
-- so it reads (companyId, keyColumn) together. Each table carried "companyId" and the key
-- column as two separate indexes, which forces a bitmap merge on every axis count. Both key
-- columns of a shared join table are indexed, because the same table serves two directions:
-- "DealContact" is read by "dealId" when grouping contacts and by "contactId" when grouping
-- deals.
--
-- CustomFieldValue: the no-value bucket of a single-select axis compiles to a NOT EXISTS on
-- (entityId, columnId). Only the single-column entity FK index existed, so that probe read
-- every value row of the record. The single-select axis itself is already covered by the
-- existing (columnId, value) and (entityType, columnId) indexes.
--
-- Entity date columns: the date-bucket axis is a fixed ladder of range counts, each one
-- conjoined with "companyId". "Deal" carried a bare ("createdAt") index and no "updatedAt"
-- index at all; the other four carried neither.
--
-- Reverse sequence: DROP INDEX on each name below. Nothing reads them but the planner.

-- CreateIndex
CREATE INDEX "Contact_companyId_createdAt_idx" ON "Contact"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Contact_companyId_updatedAt_idx" ON "Contact"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "ContactOrganization_companyId_organizationId_idx" ON "ContactOrganization"("companyId", "organizationId");

-- CreateIndex
CREATE INDEX "ContactOrganization_companyId_contactId_idx" ON "ContactOrganization"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "ContactUser_companyId_userId_idx" ON "ContactUser"("companyId", "userId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_dealId_columnId_idx" ON "CustomFieldValue"("dealId", "columnId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_contactId_columnId_idx" ON "CustomFieldValue"("contactId", "columnId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_organizationId_columnId_idx" ON "CustomFieldValue"("organizationId", "columnId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_serviceId_columnId_idx" ON "CustomFieldValue"("serviceId", "columnId");

-- CreateIndex
CREATE INDEX "CustomFieldValue_taskId_columnId_idx" ON "CustomFieldValue"("taskId", "columnId");

-- CreateIndex
CREATE INDEX "Deal_companyId_createdAt_idx" ON "Deal"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Deal_companyId_updatedAt_idx" ON "Deal"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "DealContact_companyId_dealId_idx" ON "DealContact"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "DealContact_companyId_contactId_idx" ON "DealContact"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "DealOrganization_companyId_organizationId_idx" ON "DealOrganization"("companyId", "organizationId");

-- CreateIndex
CREATE INDEX "DealOrganization_companyId_dealId_idx" ON "DealOrganization"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "DealUser_companyId_userId_idx" ON "DealUser"("companyId", "userId");

-- CreateIndex
CREATE INDEX "Organization_companyId_createdAt_idx" ON "Organization"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Organization_companyId_updatedAt_idx" ON "Organization"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "OrganizationUser_companyId_userId_idx" ON "OrganizationUser"("companyId", "userId");

-- CreateIndex
CREATE INDEX "Service_companyId_createdAt_idx" ON "Service"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Service_companyId_updatedAt_idx" ON "Service"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "ServiceDeal_companyId_serviceId_idx" ON "ServiceDeal"("companyId", "serviceId");

-- CreateIndex
CREATE INDEX "ServiceDeal_companyId_dealId_idx" ON "ServiceDeal"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "ServiceUser_companyId_userId_idx" ON "ServiceUser"("companyId", "userId");

-- CreateIndex
CREATE INDEX "Task_companyId_createdAt_idx" ON "Task"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_companyId_updatedAt_idx" ON "Task"("companyId", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskContact_companyId_taskId_idx" ON "TaskContact"("companyId", "taskId");

-- CreateIndex
CREATE INDEX "TaskContact_companyId_contactId_idx" ON "TaskContact"("companyId", "contactId");

-- CreateIndex
CREATE INDEX "TaskDeal_companyId_taskId_idx" ON "TaskDeal"("companyId", "taskId");

-- CreateIndex
CREATE INDEX "TaskDeal_companyId_dealId_idx" ON "TaskDeal"("companyId", "dealId");

-- CreateIndex
CREATE INDEX "TaskOrganization_companyId_taskId_idx" ON "TaskOrganization"("companyId", "taskId");

-- CreateIndex
CREATE INDEX "TaskOrganization_companyId_organizationId_idx" ON "TaskOrganization"("companyId", "organizationId");

-- CreateIndex
CREATE INDEX "TaskService_companyId_taskId_idx" ON "TaskService"("companyId", "taskId");

-- CreateIndex
CREATE INDEX "TaskService_companyId_serviceId_idx" ON "TaskService"("companyId", "serviceId");

-- CreateIndex
CREATE INDEX "TaskUser_companyId_userId_idx" ON "TaskUser"("companyId", "userId");

