import type { MessagingService } from "../messaging.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { SubscriptionStatus } from "@/generated/prisma";
import type { EntitlementService, EntitlementDenialCode } from "@/ee/subscription/entitlement.service";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Action, Resource, SubscriptionPlan } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { createZodError } from "@/core/validation/validation.utils";
import { getEntitlements } from "@/ee/subscription/entitlements";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";

import { signHostedAuthState } from "../webhook-signature";
import { CONNECT_CHANNELS, CONNECT_CHANNEL_KEYS } from "./connect-channels";

const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const Schema = z.object({ channel: z.enum(CONNECT_CHANNEL_KEYS) });
type CreateAuthLinkData = z.infer<typeof Schema>;

type ConnectDenialCode = "upgradeToBusinessForMoreAccounts" | "accountLimitReached";

type Denial = { key: `ConnectedAccountsCard.${ConnectDenialCode}`; code: ConnectDenialCode };
type CreateAuthLinkFailure = { ok: false; error: z.ZodError; code?: ConnectDenialCode | EntitlementDenialCode };

export abstract class CreateHostedAuthLinkRepo {
  abstract countActiveAccountsForUser(): Promise<number>;
}

export abstract class CreateAuthLinkSubscriptionRepo {
  abstract getSubscriptionOrThrow(): Promise<{
    status: SubscriptionStatus;
    trialEndDate: Date | null;
    plan: SubscriptionPlan;
  }>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class CreateAuthLinkInteractor extends UserAccessor {
  constructor(
    private messagingService: MessagingService,
    private repo: CreateHostedAuthLinkRepo,
    private subscriptionRepo: CreateAuthLinkSubscriptionRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  async invoke(data: CreateAuthLinkData): Promise<Redirect | CreateAuthLinkFailure> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const denial = await this.checkAllowance();
    if (denial) {
      const t = await getTranslations();
      return { ok: false, error: createZodError(t(denial.key)), code: denial.code };
    }

    const baseUrl = env.BASE_URL.replace(/\/+$/, "");
    const state = signHostedAuthState(this.userId);
    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    const entry: { providers: readonly string[]; config?: Record<string, unknown> } = CONNECT_CHANNELS[data.channel];
    const link = await this.messagingService.createAuthLink({
      providers: [...entry.providers],
      redirectUri: `${baseUrl}/profile/connected-accounts`,
      expiresOn,
      state,
      ...(entry.config ? { config: entry.config } : {}),
    });

    return redirectTo(link);
  }

  private async checkAllowance(): Promise<Denial | null> {
    const subscription = await this.subscriptionRepo.getSubscriptionOrThrow();

    const included = getEntitlements(subscription.plan).includedAccountsPerUser;
    if (included === "unlimited") return null;

    if ((await this.repo.countActiveAccountsForUser()) < included) return null;

    if (subscription.plan === SubscriptionPlan.business)
      return { key: "ConnectedAccountsCard.accountLimitReached", code: "accountLimitReached" };

    return {
      key: "ConnectedAccountsCard.upgradeToBusinessForMoreAccounts",
      code: "upgradeToBusinessForMoreAccounts",
    };
  }
}
