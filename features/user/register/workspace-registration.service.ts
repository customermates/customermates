import type { RegistrationAdAttribution } from "@/features/acquisition/ad-attribution.schema";
import type { TenantUser } from "@/features/user/user.service";
import type { RegisterUserCompanyRepo } from "./register-user-company.repo";
import type { RegisterUserData } from "./register-user.interactor";
import type { RegisterUserRepo } from "./register-user.repo";
import type { RegisterUserRoleRepo } from "./register-user-role.repo";

import { runInTransaction } from "@/core/decorators/transaction-runner";

export class WorkspaceRegistrationService {
  constructor(
    private readonly companies: RegisterUserCompanyRepo,
    private readonly roles: RegisterUserRoleRepo,
    private readonly users: RegisterUserRepo,
  ) {}

  createCompanyAndUser(args: RegisterUserData & { adAttribution?: RegistrationAdAttribution[] }): Promise<TenantUser> {
    return runInTransaction(async () => {
      const companyId = await this.companies.createRegisteredCompany();
      const roleId = await this.roles.createAdminRole(companyId);
      const { user, createdAt } = await this.users.createCompanyOwnerOrThrow({ ...args, companyId, roleId });
      if (args.adAttribution?.length) await this.companies.recordSignupConversion(companyId, createdAt);
      return user;
    });
  }
}
