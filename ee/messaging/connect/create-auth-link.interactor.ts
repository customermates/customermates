import type { MessagingService } from "../messaging.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { SubscriptionStatus } from "@/generated/prisma";
import type { z } from "zod";

import { getTranslations } from "next-intl/server";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { createZodError } from "@/core/validation/validation.utils";
import { isPaidSubscription } from "@/ee/subscription/subscription-expiry";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";

import { signHostedAuthState } from "../webhook-signature";

const MAX_OWNED_CHANNELS = 5;
const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const HOSTED_AUTH_PROVIDERS = ["google", "outlook", "imap", "linkedin", "whatsapp", "instagram", "telegram"];

export abstract class CreateHostedAuthLinkRepo {
  abstract getSubscriptionStatus(): Promise<SubscriptionStatus>;
  abstract countAccounts(): Promise<number>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class CreateAuthLinkInteractor extends UserAccessor {
  constructor(
    private messagingService: MessagingService,
    private repo: CreateHostedAuthLinkRepo,
  ) {
    super();
  }

  async invoke(): Promise<Redirect | { ok: false; error: z.ZodError }> {
    if (!isPaidSubscription(await this.repo.getSubscriptionStatus())) {
      const t = await getTranslations();
      return { ok: false, error: createZodError(t("ConnectedAccountsCard.paidSubscriptionRequired")) };
    }

    if ((await this.repo.countAccounts()) >= MAX_OWNED_CHANNELS) {
      const t = await getTranslations();
      return { ok: false, error: createZodError(t("ConnectedAccountsCard.channelLimitReached")) };
    }

    const baseUrl = env.BASE_URL.replace(/\/+$/, "");
    const state = signHostedAuthState(this.userId);
    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    const link = await this.messagingService.createAuthLink({
      providers: HOSTED_AUTH_PROVIDERS,
      redirectUri: `${baseUrl}/profile/connected-accounts`,
      expiresOn,
      state,
    });

    return redirectTo(link);
  }
}
