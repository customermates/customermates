import type { AuthService } from "./auth.service";
import type { UserService } from "../user/user.service";
import type { Redirect } from "./auth-outcome";
import type { TenantUser } from "@/features/user/user.schema";
import type { GetLegalStatusInteractor, LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { AccountState } from "./account-state";

import { Action, Status } from "@/generated/prisma";

import type { Resource, Subscription } from "@/generated/prisma";

import { redirectTo } from "./auth-outcome";
import { accountStateRedirect } from "./account-state";
import { mustVerifyEmail } from "./email-verification-grace";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { env } from "@/env";

const READ_ACTIONS: readonly Action[] = [Action.readOwn, Action.readAll];

export type AccessOptions = {
  resource?: Resource;
};

export abstract class RouteGuardSubscriptionRepo {
  abstract getSubscriptionOrThrowUnscoped(companyId: string): Promise<Subscription>;
}

export type AccountStateResolution = {
  state: AccountState;
  sessionUser: AccountSessionUser | null;
  user: TenantUser | null;
  emailVerified: boolean | null;
  legalStatus: LegalUpdateStatus | null;
  subscription: Subscription | null;
};

export type AccountSessionUser = {
  companyId?: string | null;
  createdAt: Date | string;
  email: string;
  emailVerified?: boolean | null;
  id: string;
  image?: string | null;
  name?: string | null;
};

export interface AccountStateResolver {
  resolveAccountState(): Promise<AccountStateResolution>;
}

export function accessRedirectForAccountState(
  resolution: AccountStateResolution,
  options?: AccessOptions,
): Redirect | null {
  if (resolution.state !== "allowed") {
    const target = accountStateRedirect(resolution.state);
    return redirectTo(target ?? "/auth/signin");
  }

  if (!options?.resource) return null;

  const user = resolution.user;
  if (!user) return redirectTo("/auth/signin");
  if (user.role?.isSystemRole) return null;

  const hasRequiredPermission =
    user.role?.permissions.some(
      (permission) => permission.resource === options.resource && READ_ACTIONS.includes(permission.action),
    ) ?? false;

  return hasRequiredPermission ? null : redirectTo("/");
}

export function unauthenticatedRedirectForAccountState(resolution: AccountStateResolution): Redirect | null {
  if (resolution.state === "unauthenticated" || resolution.state === "unregistered") return null;

  return redirectTo(accountStateRedirect(resolution.state) ?? "/");
}

function unsupportedAccountStatus(status: never): never {
  throw new Error(`Unsupported account status: ${String(status)}`);
}

export class RouteGuardService implements AccountStateResolver {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private subscriptionRepo: RouteGuardSubscriptionRepo,
    private getLegalStatusInteractor: GetLegalStatusInteractor,
  ) {}

  async resolveAccountState(): Promise<AccountStateResolution> {
    const session = await this.authService.getSession();
    if (!session) return this.resolution("unauthenticated");

    const user = await this.userService.getUser();
    const emailVerified = session.user.emailVerified ?? false;
    const sessionUser: AccountSessionUser = session.user;
    const base = {
      sessionUser,
      user,
      emailVerified,
      legalStatus: null,
      subscription: null,
    };

    if (mustVerifyEmail(session.user)) return { state: "overdueVerification", ...base };
    if (!user) return { state: "unregistered", ...base };
    switch (user.status) {
      case Status.inactive:
        return { state: "inactive", ...base };
      case Status.pendingAuthorization:
        return { state: "pending", ...base };
      case Status.active:
        break;
      default:
        return unsupportedAccountStatus(user.status);
    }
    if (user.role?.isSystemRole && user.onboardingWizardCompletedAt == null) return { state: "onboarding", ...base };

    let legalStatus: LegalUpdateStatus | null = null;
    if (env.APP_MODE === "cloud") {
      legalStatus = await this.getLegalStatusInteractor.invoke();
      if (legalStatus.mustAccept) return { state: "legal", ...base, legalStatus };
    }

    let subscription: Subscription | null = null;
    if (env.APP_MODE !== "demo") {
      subscription = await this.subscriptionRepo.getSubscriptionOrThrowUnscoped(user.companyId);
      if (isSubscriptionExpired(subscription)) return { state: "subscription", ...base, legalStatus, subscription };
    }

    return { state: "allowed", ...base, legalStatus, subscription };
  }

  private resolution(state: AccountState): AccountStateResolution {
    return {
      state,
      sessionUser: null,
      user: null,
      emailVerified: null,
      legalStatus: null,
      subscription: null,
    };
  }
}
