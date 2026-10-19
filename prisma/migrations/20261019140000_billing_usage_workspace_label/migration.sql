-- A deleted workspace keeps the label it had, for the usage report.
ALTER TABLE "BillingUsageWorkspace" ADD COLUMN "workspaceLabel" TEXT;
