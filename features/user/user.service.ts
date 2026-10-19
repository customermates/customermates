import { rolePermits } from "@/core/base/permission.service";
import type { TenantUser } from "./user.schema";
import type { FindUserRepo } from "./find-user.repo";
import type { AuthService } from "@/features/auth/auth.service";
import type { ActiveWorkspaceService } from "@/features/workspace/active-workspace.service";
import type { WorkspacePlanService } from "@/ee/subscription/workspace-plan.service";

import * as Sentry from "@sentry/nextjs";

import { Status } from "@/generated/prisma";
import { env } from "@/env";

import type { Action, Resource } from "@/generated/prisma";

import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { tenantStorage } from "@/core/decorators/tenant-context";
import { canUseApiKeys } from "@/core/auth/api-key-route-guard";
import { ApiKeyAccessDeniedError } from "@/core/auth/api-key-access-denied-error";
import { WorkspacePlanRequiredError } from "@/core/auth/workspace-plan-required-error";

export const LAST_ACTIVE_RESOLUTION_MS = 15 * 60 * 1000;

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

    if (!(await this.authService.isIntegrationCredentialRequest())) {
      await this.recordActivity(user);
      return user;
    }

    if (!canUseApiKeys(user.role)) throw new ApiKeyAccessDeniedError();
    if (!(await this.plans.canUseIntegrations(user.companyId))) throw new WorkspacePlanRequiredError();

    return user;
  }

  private async recordActivity(user: TenantUser) {
    if (env.APP_MODE === "demo") return;
    const staleBefore = new Date(Date.now() - LAST_ACTIVE_RESOLUTION_MS);
    if (user.lastActiveAt && user.lastActiveAt >= staleBefore) return;

    try {
      await this.repo.touchLastActiveUnscoped(user, staleBefore);
    } catch (error) {
      Sentry.captureException(error, { tags: { kind: "last-active" } });
    }
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
