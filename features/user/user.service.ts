import { rolePermits } from "@/core/base/permission.service";
import type { TenantUser } from "./user.schema";
import type { FindUserRepo } from "./find-user.repo";
import type { AuthService } from "@/features/auth/auth.service";

import { Status } from "@/generated/prisma";

import type { Action, Resource } from "@/generated/prisma";

import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { tenantStorage } from "@/core/decorators/tenant-context";
import { canUseApiKeys } from "@/core/auth/api-key-route-guard";
import { ApiKeyAccessDeniedError } from "@/core/auth/api-key-access-denied-error";

export type { TenantUser } from "./user.schema";
export type { AuthUserAccountState, FindUserRepo } from "./find-user.repo";

export class UserService {
  constructor(
    private authService: AuthService,
    private repo: FindUserRepo,
  ) {}

  async getUserOrThrow() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) throw new AuthError();

    return await this.repo.findCurrentUserOrThrowUnscoped(email);
  }

  async getActiveUserOrThrow() {
    const user = await this.getUserOrThrow();

    if (user.status !== Status.active) throw new ForbiddenError("User is not active", AppErrorCode.inactiveUser);

    if (!canUseApiKeys(user.role) && (await this.authService.isIntegrationCredentialRequest()))
      throw new ApiKeyAccessDeniedError();

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

  async isRegistered() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) return false;

    return (await this.repo.findCurrentUserUnscoped(email)) !== null;
  }

  async hasPermission(resource: Resource, action: Action): Promise<boolean> {
    const user = await this.getActiveTenantUserOrThrow();

    return rolePermits(user.role, resource, action);
  }
}
