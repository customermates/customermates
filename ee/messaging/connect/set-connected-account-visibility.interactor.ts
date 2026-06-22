import type { Data } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto } from "../messaging.schema";
import type { EventService } from "@/features/event/event.service";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountDtoSchema } from "../messaging.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";

const Schema = z.object({
  id: z.uuid(),
  shared: z.boolean(),
});
type SetConnectedAccountVisibilityData = Data<typeof Schema>;

export abstract class SetConnectedAccountVisibilityRepo {
  abstract getAccountByIdOrThrow(id: string): Promise<ConnectedAccountDto>;
  abstract setAccountSharedOrThrow(args: { id: string; shared: boolean }): Promise<ConnectedAccountDto>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class SetConnectedAccountVisibilityInteractor extends AuthenticatedInteractor<
  SetConnectedAccountVisibilityData,
  ConnectedAccountDto
> {
  constructor(
    private repo: SetConnectedAccountVisibilityRepo,
    private eventService: EventService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ConnectedAccountDtoSchema)
  async invoke(data: SetConnectedAccountVisibilityData): Promise<{ ok: true; data: ConnectedAccountDto }> {
    const existing = await this.repo.getAccountByIdOrThrow(data.id);

    if (existing.shared === data.shared) return { ok: true as const, data: existing };

    const updated = await this.repo.setAccountSharedOrThrow({ id: data.id, shared: data.shared });

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_UPDATED, {
      entityId: data.id,
      payload: {
        connectedAccount: {
          provider: updated.provider,
          displayName: updated.displayName,
          emailAddress: updated.emailAddress,
        },
        changes: {
          visibility: {
            previous: existing.shared ? "shared" : "private",
            current: data.shared ? "shared" : "private",
          },
        },
      },
    });

    return { ok: true as const, data: updated };
  }
}
