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

import { signHostedAuthName } from "../webhook-signature";

const MAX_OWNED_CHANNELS = 2;

export abstract class CreateHostedAuthLinkRepo {
  abstract getSubscriptionStatus(): Promise<SubscriptionStatus>;
  abstract countOwnedAccounts(): Promise<number>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.create })
export class CreateHostedAuthLinkInteractor extends UserAccessor {
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

    if ((await this.repo.countOwnedAccounts()) >= MAX_OWNED_CHANNELS) {
      const t = await getTranslations();
      return { ok: false, error: createZodError(t("ConnectedAccountsCard.channelLimitReached")) };
    }

    const baseUrl = env.BASE_URL.replace(/\/+$/, "");
    const token = signHostedAuthName(this.userId);
    const notifyUrl = `${baseUrl}/api/webhooks/unipile/account-callback?token=${token}`;
    const successUrl = `${baseUrl}/profile/connected-accounts?status=connected`;
    const failureUrl = `${baseUrl}/profile/connected-accounts?status=failed`;

    const { url } = await this.messagingService.createHostedAuthLink({
      userId: this.userId,
      successUrl,
      failureUrl,
      notifyUrl,
    });

    if (!url) throw new Error("Unipile returned a hosted auth link without a url");

    return redirectTo(url);
  }
}
