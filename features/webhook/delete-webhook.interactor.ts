import type { DeleteWebhookRepo } from "./delete-webhook.repo";
import type { WebhookDto } from "./webhook.schema";
import type { EventService } from "@/features/event/event.service";
import type { Data } from "@/core/validation/validation.utils";
import type { ValidateWebhookIdsInteractor } from "@/core/validation/validators/validate-webhook-ids.interactor";

import { toWebhookEventPayload } from "./webhook-event-payload";
import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { DomainEvent } from "@/features/event/domain-events";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { RecordWriteError } from "@/features/records/record-write.service";
import { recordWriteFailure } from "@/features/records/mutate-record.interactor";

const Schema = z.object({
  id: z.uuid(),
});
export type DeleteWebhookData = Data<typeof Schema>;

@TenantInteractor({ resource: Resource.api, action: Action.delete })
export class DeleteWebhookInteractor extends AuthenticatedInteractor<DeleteWebhookData, string> {
  constructor(
    private repo: DeleteWebhookRepo,
    private eventService: EventService,
    private validator: ValidateWebhookIdsInteractor,
  ) {
    super();
  }

  @Write({
    input: Schema,
    output: z.string(),
    precheck: (self, data, ctx) => self.validator.invoke([{ ids: data.id, path: ["id"] }], ctx),
  })
  async invoke(data: DeleteWebhookData): Validated<string> {
    let webhook: WebhookDto;
    try {
      webhook = await this.repo.deleteWebhookOrThrow(data.id);
    } catch (error) {
      if (error instanceof RecordWriteError) return recordWriteFailure(error);
      throw error;
    }

    await this.eventService.publish(DomainEvent.WEBHOOK_DELETED, {
      entityId: webhook.id,
      payload: toWebhookEventPayload(webhook),
    });

    return { ok: true as const, data: data.id };
  }
}
