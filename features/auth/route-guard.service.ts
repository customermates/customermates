import type { AuthService } from "./auth.service";
import type { FindUserRepo } from "../user/user.service";
import type { Redirect } from "./auth-outcome";
import type { TenantUser } from "@/features/user/user.schema";
import type { GetLegalStatusInteractor, LegalUpdateStatus } from "@/features/legal/get-legal-status.interactor";
import type { AccountState } from "./account-state";
import type { RouteGuardCompanyRepo } from "./route-guard-company.repo";
import type { ActiveWorkspaceService } from "@/features/workspace/active-workspace.service";

import { Action, Status } from "@/generated/prisma";

import type { Resource, Subscription } from "@/generated/prisma";

import { redirectTo } from "./auth-outcome";
import { accountStateRedirect } from "./account-state";
import { mustVerifyEmail } from "./email-verification-grace";
import { isSubscriptionExpired } from "@/ee/subscription/entitlements";
import { env } from "@/env";
import { runWithTenant } from "@/core/decorators/tenant-context";

const READ_ACTIONS: readonly Action[] = [Action.readOwn, Action.readAll];

export type AccessOptions = {
  resource?: Resource;
};

export type AccountStateResolution = {
  state: AccountState;
  sessionUser: AccountSessionUser | null;
  user: TenantUser | null;
  emailVerified: boolean | null;
  legalStatus: LegalUpdateStatus | null;
  subscription: Subscription | null;
};

type AccountSessionUser = {
  companyId?: string | null;
  createdAt: Date | string;
  email: string;
  emailVerified?: boolean | null;
  id: string;
  image?: string | null;
  name?: string | null;
};

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

export class RouteGuardService {
  constructor(
    private authService: AuthService,
    private userRepo: FindUserRepo,
    private companyRepo: RouteGuardCompanyRepo,
    private getLegalStatusInteractor: GetLegalStatusInteractor,
    private workspaces: ActiveWorkspaceService,
  ) {}

  async resolveAccountState(options: { ignoreRequestedWorkspace?: boolean } = {}): Promise<AccountStateResolution> {
    const session = await this.authService.getSession();
    if (!session) {
      return {
        state: "unauthenticated",
        sessionUser: null,
        user: null,
        emailVerified: null,
        legalStatus: null,
        subscription: null,
      };
    }

    const authUserState = await this.userRepo.findAuthUserAccountStateUnscoped(session.user.id);
    if (authUserState === undefined) {
      return {
        state: "unauthenticated",
        sessionUser: null,
        user: null,
        emailVerified: null,
        legalStatus: null,
        subscription: null,
      };
    }

    const user = await this.workspaces.resolveMembership(
      session,
      options.ignoreRequestedWorkspace ? new Headers() : undefined,
    );
    const authUserCompanyId = authUserState.companyId;
    let companyId = user?.companyId ?? null;
    if (
      !user &&
      authUserCompanyId &&
      (await this.companyRepo.existsUnscoped(authUserCompanyId)) &&
      !(await this.userRepo.hasLeftMembershipUnscoped(session.user.email, authUserCompanyId))
    )
      companyId = authUserCompanyId;
    const emailVerified = authUserState.emailVerified;
    const sessionUser: AccountSessionUser = {
      ...session.user,
      companyId,
      emailVerified,
    };
    const base = {
      sessionUser,
      user,
      emailVerified,
      legalStatus: null,
      subscription: null,
    };

    if (mustVerifyEmail(sessionUser)) return { state: "overdueVerification", ...base };
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
    const commercial = options.ignoreRequestedWorkspace
      ? await runWithTenant(user, () => this.resolveCommercialState(user))
      : await this.resolveCommercialState(user);
    if (user.role?.isSystemRole && user.onboardingWizardCompletedAt == null && commercial.state !== "subscription")
      return { state: "onboarding", ...base };

    return { ...base, ...commercial };
  }

  async resolveMcpConsentState(resolution: AccountStateResolution): Promise<AccountState> {
    if (resolution.state !== "onboarding" || !resolution.user) return resolution.state;

    const { state } = await this.resolveCommercialState(resolution.user);
    return state === "allowed" ? "onboarding" : state;
  }

  async resolveMembershipForConsent(companyId: string): Promise<TenantUser | null> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return null;

    const membership = await this.userRepo.findMembershipUnscoped(session.user.email, companyId);
    if (!membership || membership.status !== Status.active) return null;

    const { state } = await runWithTenant(membership, () => this.resolveCommercialState(membership));
    return state === "allowed" ? membership : null;
  }

  private async resolveCommercialState(user: TenantUser): Promise<{
    state: Extract<AccountState, "legal" | "subscription" | "allowed">;
    legalStatus: LegalUpdateStatus | null;
    subscription: Subscription | null;
  }> {
    let legalStatus: LegalUpdateStatus | null = null;
    if (env.APP_MODE === "cloud") {
      legalStatus = await this.getLegalStatusInteractor.invoke();
      if (legalStatus.mustAccept) return { state: "legal", legalStatus, subscription: null };
    }

    let subscription: Subscription | null = null;
    if (env.APP_MODE !== "demo") {
      subscription = await this.companyRepo.getSubscriptionOrThrowUnscoped(user.companyId);
      if (isSubscriptionExpired(subscription)) return { state: "subscription", legalStatus, subscription };
    }

    return { state: "allowed", legalStatus, subscription };
  }
}
