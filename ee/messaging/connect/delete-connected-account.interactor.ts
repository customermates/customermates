import type { MessagingService } from "../messaging.service";
import type { EventService } from "@/features/event/event.service";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { Resource } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { DomainEvent } from "@/features/event/domain-events";
import type { DeleteConnectedAccountRepo } from "./delete-connected-account.repo";

const Schema = z.object({ id: z.uuid() }).strict();
type DeleteConnectedAccountData = Data<typeof Schema>;
export const ConnectedAccountDisconnectedSchema = z.object({ id: z.uuid(), disconnected: z.literal(true) });
type ConnectedAccountDisconnected = z.infer<typeof ConnectedAccountDisconnectedSchema>;

@TenantInteractor({ resource: Resource.inboxMessages, manage: "delete" })
export class DeleteConnectedAccountInteractor extends AuthenticatedInteractor<
  DeleteConnectedAccountData,
  ConnectedAccountDisconnected
> {
  constructor(
    private repo: DeleteConnectedAccountRepo,
    private messagingService: MessagingService,
    private eventService: EventService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(ConnectedAccountDisconnectedSchema)
  async invoke(data: DeleteConnectedAccountData): Validated<ConnectedAccountDisconnected> {
    const existing = await this.repo.findAccountByIdOrThrow(data.id);

    await this.repo.deleteAccount(data.id);

    await this.eventService.publish(DomainEvent.CONNECTED_ACCOUNT_DELETED, {
      entityId: existing.id,
      payload: {
        provider: existing.provider,
        displayName: existing.displayName,
        emailAddress: existing.emailAddress,
      },
    });

    await this.messagingService.deleteAccount({ accountId: existing.unipileAccountId }).catch((error: unknown) => {
      Sentry.captureException(error, { tags: { kind: "unipile-account-removal-deferred" } });
    });

    return { ok: true as const, data: { id: existing.id, disconnected: true as const } };
  }
}
