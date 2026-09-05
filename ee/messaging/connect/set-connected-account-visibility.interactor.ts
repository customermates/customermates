import type { Data, Validated } from "@/core/validation/validation.utils";
import type { ConnectedAccountDto, ConnectedAccountRecord } from "../messaging.schema";
import type { EventService } from "@/features/event/event.service";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { z } from "zod";

import { Action, Resource } from "@/generated/prisma";

import { ConnectedAccountAppDtoSchema } from "../messaging.schema";
import { toConnectedAccountDto } from "./connected-account-dto";

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
  abstract getAccountByIdOrThrow(id: string): Promise<ConnectedAccountRecord>;
  abstract setAccountSharedOrThrow(args: { id: string; shared: boolean }): Promise<ConnectedAccountRecord>;
}

@TenantInteractor({ resource: Resource.inboxMessages, action: Action.update })
export class SetConnectedAccountVisibilityInteractor extends AuthenticatedInteractor<
  SetConnectedAccountVisibilityData,
  ConnectedAccountDto
> {
  constructor(
    private repo: SetConnectedAccountVisibilityRepo,
    private eventService: EventService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Enforce(Schema)
  @ValidateOutput(ConnectedAccountAppDtoSchema)
  async invoke(data: SetConnectedAccountVisibilityData): Validated<ConnectedAccountDto> {
    const denied = await this.entitlements.require("sharedAccounts");
    if (denied) return denied;

    const existing = await this.repo.getAccountByIdOrThrow(data.id);

    if (existing.shared === data.shared) return { ok: true as const, data: toConnectedAccountDto(existing) };

    const updated = await this.repo.setAccountSharedOrThrow({
      id: data.id,
      shared: data.shared,
    });

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

    return { ok: true as const, data: toConnectedAccountDto(updated) };
  }
}
