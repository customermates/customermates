import type { MessagingService } from "../messaging.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { SubscriptionStatus } from "@/generated/prisma";

import { z } from "zod";
import { getTranslations } from "next-intl/server";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { createZodError } from "@/core/validation/validation.utils";
import { isPaidSubscription } from "@/ee/subscription/subscription-expiry";
import { redirectTo } from "@/features/auth/auth-outcome";
import { env } from "@/env";

import { signHostedAuthState } from "../webhook-signature";
import { CONNECT_CHANNELS, CONNECT_CHANNEL_KEYS } from "./connect-channels";

const MAX_OWNED_CHANNELS = 5;
const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const Schema = z.object({ channel: z.enum(CONNECT_CHANNEL_KEYS) });
type CreateAuthLinkData = z.infer<typeof Schema>;

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

  @Validate(Schema)
  async invoke(data: CreateAuthLinkData): Promise<Redirect | { ok: false; error: z.ZodError }> {
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
}
