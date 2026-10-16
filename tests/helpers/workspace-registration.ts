import { PermissionService } from "@/core/base/permission.service";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { WorkspaceRegistrationService } from "@/features/user/register/workspace-registration.service";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

export const createTestWorkspaceRegistration = () =>
  new WorkspaceRegistrationService(
    new PrismaCompanyRepo(new PrismaBillingUsageRepo()),
    new PrismaRoleRepo(new PrismaBillingUsageRepo()),
    new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo()),
  );
