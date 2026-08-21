import type { TenantUser } from "./user.schema";
import type { AuthService } from "@/features/auth/auth.service";

import { Status } from "@/generated/prisma";

import type { Action, Resource } from "@/generated/prisma";

import { AppErrorCode, AuthError, ForbiddenError } from "@/core/errors/app-errors";

export type { TenantUser } from "./user.schema";

export abstract class FindUserRepo {
  abstract findCurrentUserUnscoped(email: string): Promise<TenantUser | null>;
  abstract findCurrentUserOrThrowUnscoped(email: string): Promise<TenantUser>;
}

export class UserService {
  constructor(
    private authService: AuthService,
    private repo: FindUserRepo,
  ) {}

  async getUser() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) return null;

    return await this.repo.findCurrentUserUnscoped(email);
  }

  async getUserOrThrow() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) throw new AuthError();

    return await this.repo.findCurrentUserOrThrowUnscoped(email);
  }

  async getActiveUserOrThrow() {
    const user = await this.getUserOrThrow();

    if (user.status !== Status.active) throw new ForbiddenError("User is not active", AppErrorCode.inactiveUser);

    return user;
  }

  async isRegistered() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) return false;

    return (await this.repo.findCurrentUserUnscoped(email)) !== null;
  }

  async hasPermission(resource: Resource, action: Action): Promise<boolean> {
    const user = await this.getActiveUserOrThrow();

    if (!user.role) return false;

    if (user.role?.isSystemRole) return true;

    return user.role?.permissions.some((p) => p.resource === resource && p.action === action) ?? false;
  }

  async hasPermissionOrThrow(resource: Resource, action: Action): Promise<void> {
    const hasPermission = await this.hasPermission(resource, action);

    if (!hasPermission) throw new ForbiddenError("User has insufficient permissions", AppErrorCode.permissionDenied);
  }
}
