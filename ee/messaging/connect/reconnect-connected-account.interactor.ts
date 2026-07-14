import type { MessagingService } from "../messaging.service";
import type { ConnectedAccount } from "@/generated/prisma";
import type { EventService } from "@/features/event/event.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Data } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { redirectTo } from "@/features/auth/auth-outcome";
import { signHostedAuthState } from "../webhook-signature";
import { DomainEvent } from "@/features/event/domain-events";
import { env } from "@/env";

const HOSTED_AUTH_EXPIRY_MINUTES = 30;

const Schema = z.object({ id: z.uuid() });
type ReconnectConnectedAccountData = Data<typeof Schema>;

export abstract class ReconnectConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class ReconnectConnectedAccountInteractor extends UserAccessor {
  constructor(
    private repo: ReconnectConnectedAccountRepo,
    private messagingService: MessagingService,
    private eventService: EventService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ReconnectConnectedAccountData): Promise<Redirect | { ok: false; error: z.ZodError }> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.repo.findAccountByIdOrThrow(data.id);

    const baseUrl = env.BASE_URL.replace(/\/+$/, "");
    const state = signHostedAuthState(this.userId);
    const expiresOn = new Date(Date.now() + HOSTED_AUTH_EXPIRY_MINUTES * 60_000).toISOString();

    const link = await this.messagingService.createReconnectAuthLink({
      accountId: account.unipileAccountId,
      redirectUri: `${baseUrl}/profile/connected-accounts`,
      expiresOn,
      state,
    });

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_RECONNECTED, {
      entityId: account.id,
      payload: {
        provider: account.provider,
        displayName: account.displayName,
        emailAddress: account.emailAddress,
      },
    });

    return redirectTo(link);
  }
}
