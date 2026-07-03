import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { z } from "zod";

import type { WebhookEventRepo } from "./webhook-event.repo";

import { UnipileWebhookEnvelopeSchema } from "../unipile.schema";
import type { UnipileWebhookHandlerMap } from "./webhook-interactor";

const Schema = z.object({ id: z.uuid() });
type ProcessUnipileWebhookPayload = z.infer<typeof Schema>;

@SystemInteractor
export class ProcessUnipileWebhookInteractor {
  constructor(
    private events: WebhookEventRepo,
    private handlers: UnipileWebhookHandlerMap,
  ) {}

  @Enforce(Schema)
  async invoke({ id }: ProcessUnipileWebhookPayload): Promise<void> {
    const row = await this.events.findWebhookEventByIdOrThrowUnscoped(id);
    if (row.processed) return;

    try {
      const envelope = UnipileWebhookEnvelopeSchema.parse(row.payload);

      await this.handlers[envelope.type]?.invoke(envelope);
      await this.events.markWebhookEventUnscoped({ id, processed: true });
    } catch (err) {
      await this.events.markWebhookEventUnscoped({
        id,
        processed: false,
        error: err instanceof Error ? err.message : String(err),
        lastErrorAt: new Date(),
      });

      throw err;
    }
  }
}
