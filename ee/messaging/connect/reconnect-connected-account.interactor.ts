import type { MessagingService } from "../messaging.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Data } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { headers } from "next/headers";
import { z } from "zod";
import * as Sentry from "@sentry/node";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { resolveRequestOrigin } from "@/core/config/environment";
import { redirectTo } from "@/features/auth/auth-outcome";
import { signHostedAuthState } from "../webhook-signature";
import { fail } from "@/core/validation/interactor-failure-server";
import { retryAfterPhrase } from "../retry-after.server";
import { unipileErrorCode } from "../messaging.service";
import { UnipileRequestError } from "../unipile-request-error";
import { env } from "@/env";
import type { ReconnectConnectedAccountRepo } from "./reconnect-connected-account.repo";
import { settingsHref } from "@/app/components/navigation/settings-routes";

const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const Schema = z.object({ id: z.uuid() });
type ReconnectConnectedAccountData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class ReconnectConnectedAccountInteractor extends UserAccessor {
  constructor(
    private repo: ReconnectConnectedAccountRepo,
    private messagingService: MessagingService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ReconnectConnectedAccountData): Promise<Redirect | { ok: false; error: z.ZodError }> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.repo.findAccountByIdOrThrow(data.id);

    const requestOrigin = (await headers()).get("origin") ?? env.BASE_URL;
    const baseUrl = resolveRequestOrigin(requestOrigin, env.AUTH_ALLOWED_HOSTS, env.BASE_URL);
    const state = signHostedAuthState(this.userId);
    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    let link: string;
    try {
      link = await this.messagingService.createReconnectAuthLink({
        accountId: account.unipileAccountId,
        redirectUri: `${baseUrl}${settingsHref("channels")}`,
        expiresOn,
        state,
      });
    } catch (err) {
      if (!(err instanceof UnipileRequestError)) throw err;

      Sentry.captureException(err, { tags: { kind: "unipile-auth-link" } });
      return fail(unipileErrorCode(err), [], { retryAfter: await retryAfterPhrase(err.retryAfterSeconds) });
    }

    return redirectTo(link);
  }
}
