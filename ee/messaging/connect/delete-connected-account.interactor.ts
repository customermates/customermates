import type { ConnectedAccount } from "../messaging.schema";
import type { MessagingService } from "../messaging.service";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({ id: z.uuid() });
type DeleteConnectedAccountData = Data<typeof Schema>;

export abstract class DeleteConnectedAccountRepo {
  abstract findOwnedAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
  abstract deleteAccount(id: string): Promise<void>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.delete })
export class DeleteConnectedAccountInteractor extends AuthenticatedInteractor<DeleteConnectedAccountData, null> {
  constructor(
    private repo: DeleteConnectedAccountRepo,
    private messagingService: MessagingService,
    private eventService: EventService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: DeleteConnectedAccountData): Promise<{ ok: true; data: null }> {
    const existing = await this.repo.findOwnedAccountByIdOrThrow(data.id);

    await this.repo.deleteAccount(data.id);

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_DELETED, {
      entityId: existing.id,
      payload: {
        provider: existing.provider,
        displayName: existing.displayName,
        emailAddress: existing.emailAddress,
      },
    });

    await this.messagingService.deleteRemoteAccount(existing.unipileAccountId);

    return { ok: true as const, data: null };
  }
}
