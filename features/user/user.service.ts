import { Action, Resource, Status, type User } from "@/generated/prisma";

import { UserRoleDto } from "../role/get-roles.interactor";

import { AuthService } from "@/features/auth/auth.service";
import { TenantAgnostic } from "@/core/decorators/tenant-agnostic.decorator";

type SensitiveUserFields =
  | "crmApiKeyId"
  | "crmApiKey"
  | "agentGatewayToken"
  | "agentHooksToken"
  | "welcomeEmailSentAt"
  | "trialExpiredOfferSentAt"
  | "trialInactivationReminderSentAt"
  | "trialInactivationNoticeSentAt";

export type ExtendedUser = Omit<User, SensitiveUserFields> & {
  role: UserRoleDto | null;
};

export abstract class FindUserRepo {
  abstract findCurrentUser(email: string): Promise<ExtendedUser | null>;
  abstract findCurrentUserOrThrow(email: string): Promise<ExtendedUser>;
}

@TenantAgnostic
export class UserService {
  constructor(
    private authService: AuthService,
    private repo: FindUserRepo,
  ) {}

  async getUser() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) return null;

    return await this.repo.findCurrentUser(email);
  }

  async getUserOrThrow() {
    const session = await this.authService.getSession();

    const email = session?.user?.email;

    if (!email) throw new Error("User not found");

    return await this.repo.findCurrentUserOrThrow(email);
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

    return (await this.repo.findCurrentUser(email)) !== null;
  }

  async hasPermission(resource: Resource, action: Action): Promise<boolean> {
    const user = await this.getActiveUserOrThrow();

    if (!user.role) return false;

    if (user.role?.isSystemRole) return true;

    return user.role?.permissions?.some((p) => p.resource === resource && p.action === action) ?? false;
  }

  async hasPermissionOrThrow(resource: Resource, action: Action): Promise<void> {
    const hasPermission = await this.hasPermission(resource, action);

    if (!hasPermission) throw new Error("User has insufficient permissions");
  }
}
