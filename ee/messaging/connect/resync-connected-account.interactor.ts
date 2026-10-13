import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";
import type { ResyncConnectedAccountRepo } from "./resync-connected-account.repo";

const Schema = z.object({ id: z.uuid() }).strict();
type ResyncConnectedAccountData = Data<typeof Schema>;
export const ConnectedAccountResyncStartedSchema = z.object({ id: z.uuid(), resyncStarted: z.literal(true) });
type ConnectedAccountResyncStarted = z.infer<typeof ConnectedAccountResyncStartedSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "update" })
export class ResyncConnectedAccountInteractor extends AuthenticatedInteractor<
  ResyncConnectedAccountData,
  ConnectedAccountResyncStarted
> {
  constructor(
    private repo: ResyncConnectedAccountRepo,
    private backgroundTaskService: BackgroundTaskService,
    private eventService: EventService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ConnectedAccountResyncStartedSchema)
  async invoke(data: ResyncConnectedAccountData): Validated<ConnectedAccountResyncStarted> {
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

    return { ok: true as const, data: { id: account.id, resyncStarted: true as const } };
  }
}
