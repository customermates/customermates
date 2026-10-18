import { rolePermits } from "@/core/base/permission.service";
import type { TenantUser } from "./user.schema";
import type { FindUserRepo } from "./find-user.repo";
import type { AuthService } from "@/features/auth/auth.service";
import type { ActiveWorkspaceService } from "@/features/workspace/active-workspace.service";
import type { WorkspacePlanService } from "@/ee/subscription/workspace-plan.service";

import { Status } from "@/generated/prisma";

import type { Action, Resource } from "@/generated/prisma";

import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { tenantStorage } from "@/core/decorators/tenant-context";
import { canUseApiKeys } from "@/core/auth/api-key-route-guard";
import { ApiKeyAccessDeniedError } from "@/core/auth/api-key-access-denied-error";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";

export type { TenantUser } from "./user.schema";
export type { FindUserRepo } from "./find-user.repo";

export class UserService {
  constructor(
    private authService: AuthService,
    private repo: FindUserRepo,
    private workspaces: ActiveWorkspaceService,
    private plans: Pick<WorkspacePlanService, "canUseIntegrations">,
  ) {}

  async getUserOrThrow() {
    const session = await this.authService.getSession();

    if (!session?.user?.email) throw new AuthError();

    const user = await this.workspaces.requireMembership(session);
    if (!user) throw new AuthError();

    return user;
  }

  async getActiveUserOrThrow() {
    const user = await this.getUserOrThrow();

    if (user.status !== Status.active) throw new ForbiddenError("User is not active", AppErrorCode.inactiveUser);

    if (!(await this.authService.isIntegrationCredentialRequest())) return user;

    if (!canUseApiKeys(user.role)) throw new ApiKeyAccessDeniedError();
    if (!(await this.plans.canUseIntegrations(user.companyId))) throw new WorkspacePlanRequiredError();

    return user;
  }

  async getActiveTenantUserOrThrow(): Promise<TenantUser> {
    const ambient = tenantStorage.getStore()?.user;
    if (!ambient) return this.getActiveUserOrThrow();

    if (ambient.status !== Status.active) throw new ForbiddenError("User is not active", AppErrorCode.inactiveUser);

    return ambient;
  }

  async getActiveUserByIdOrThrow(userId: string, options: { allowInactive?: boolean } = {}) {
    const user = await this.repo.findUserByIdOrThrowUnscoped(userId);

    if (user.status !== Status.active && !options.allowInactive)
      throw new ForbiddenError("User is not active", AppErrorCode.inactiveUser);

    return user;
  }

  async hasPermission(resource: Resource, action: Action): Promise<boolean> {
    const user = await this.getActiveTenantUserOrThrow();

    return rolePermits(user.role, resource, action);
  }
}
