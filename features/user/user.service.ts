import type { ExtendedUser } from "./user.types";
import type { AuthService } from "@/features/auth/auth.service";

import { Status } from "@/generated/prisma";

import type { Action, Resource } from "@/generated/prisma";

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";
import { tenantStorage } from "@/core/decorators/tenant-context";

export type { ExtendedUser } from "./user.types";

export abstract class FindUserRepo {
  abstract findCurrentUserUnscoped(email: string): Promise<ExtendedUser | null>;
  abstract findCurrentUserOrThrowUnscoped(email: string): Promise<ExtendedUser>;
  abstract findExtendedUserByIdOrThrowUnscoped(userId: string): Promise<ExtendedUser>;
}

export class UserService {
  constructor(
    private authService: AuthService,
    private repo: FindUserRepo,
  ) {}

  async getUser() {
    // Server-side execution can establish the active user via runWithTenant (e.g.
    // the code-exec data broker, which authenticates with a run token, not a
    // session). Prefer that user over re-deriving from request headers.
    const contextUser = tenantStorage.getStore()?.user;
    if (contextUser) return contextUser;

    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) return null;

    return await this.repo.findCurrentUserUnscoped(email);
  }

  async getUserOrThrow() {
    const contextUser = tenantStorage.getStore()?.user;
    if (contextUser) return contextUser;

    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) throw new AuthError();

    return await this.repo.findCurrentUserOrThrowUnscoped(email);
  }

  /**
   * Load an active user by id without a session/tenant scope. Used by the
   * code-exec data broker to resolve the run token's user before re-entering
   * runWithTenant. Throws if the user is missing or not active.
   */
  async loadActiveUserByIdUnscoped(userId: string): Promise<ExtendedUser> {
    const user = await this.repo.findExtendedUserByIdOrThrowUnscoped(userId);
    if (user.status !== Status.active) throw new AuthError();
    return user;
  }

  async getActiveUserOrThrow() {
    const user = await this.getUserOrThrow();

    if (user.status !== Status.active) throw new Error("User is not active");

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

    return user.role?.permissions?.some((p) => p.resource === resource && p.action === action) ?? false;
  }

  async hasPermissionOrThrow(resource: Resource, action: Action): Promise<void> {
    const hasPermission = await this.hasPermission(resource, action);

    if (!hasPermission) throw new ForbiddenError("User has insufficient permissions");
  }
}
