import { PermissionService } from "@/core/base/permission.service";
import { PrismaCompanyRepo } from "@/features/company/prisma-company.repository";
import { PrismaRoleRepo } from "@/features/role/prisma-role.repository";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";
import { WorkspaceRegistrationService } from "@/features/user/register/workspace-registration.service";

export const createTestWorkspaceRegistration = () =>
  new WorkspaceRegistrationService(new PrismaCompanyRepo(), new PrismaRoleRepo(), new PrismaUserRepo(new PermissionService()));
