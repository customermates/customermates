import type { ConnectedAccount } from "@/generated/prisma";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({ id: z.uuid() });
type ResyncConnectedAccountData = Data<typeof Schema>;

export abstract class ResyncConnectedAccountRepo {
  abstract findAccountByIdOrThrow(id: string): Promise<ConnectedAccount>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class ResyncConnectedAccountInteractor extends AuthenticatedInteractor<ResyncConnectedAccountData, null> {
  constructor(
    private repo: ResyncConnectedAccountRepo,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  async invoke(data: ResyncConnectedAccountData): Validated<null> {
    const denied = await this.entitlements.require("messaging");
    if (denied) return denied;

    const account = await this.repo.findAccountByIdOrThrow(data.id);

    await this.backgroundTaskService.dispatch("backfill-connected-account", { connectedAccountId: account.id });

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_RESYNCED, {
      entityId: account.id,
      payload: {
        provider: account.provider,
        displayName: account.displayName,
        emailAddress: account.emailAddress,
      },
    });

    return { ok: true as const, data: null };
  }
}
