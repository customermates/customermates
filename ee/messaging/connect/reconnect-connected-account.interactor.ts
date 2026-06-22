import type { ConnectedAccount } from "@/generated/prisma";
import type { MessagingService } from "../messaging.service";
import type { EventService } from "@/features/event/event.service";
import type { Redirect } from "@/features/auth/auth-outcome";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { UserAccessor } from "@/core/base/user-accessor";
import { redirectTo } from "@/features/auth/auth-outcome";
import { signHostedAuthName } from "../webhook-signature";
import { DomainEvent } from "@/features/event/domain-events";
import { env } from "@/env";

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
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ReconnectConnectedAccountData): Promise<Redirect> {
    const account = await this.repo.findAccountByIdOrThrow(data.id);

    const baseUrl = env.BASE_URL.replace(/\/+$/, "");
    const token = signHostedAuthName(this.userId);

    const { url } = await this.messagingService.createReconnectHostedAuthLink({
      userId: this.userId,
      unipileAccountId: account.unipileAccountId,
      successUrl: `${baseUrl}/profile/connected-accounts?status=connected`,
      failureUrl: `${baseUrl}/profile/connected-accounts?status=failed`,
      notifyUrl: `${baseUrl}/api/webhooks/unipile/account-callback?token=${token}`,
    });

    if (!url) throw new Error("Unipile returned a hosted auth link without a url");

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_RECONNECTED, {
      entityId: account.id,
      payload: {
        provider: account.provider,
        displayName: account.displayName,
        emailAddress: account.emailAddress,
      },
    });

    return redirectTo(url);
  }
}
