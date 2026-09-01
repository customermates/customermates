import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { z } from "zod";
import * as Sentry from "@sentry/node";

import type { WebhookEventRepo } from "./webhook-event.repo";
import type { UnipileWebhookEnvelope } from "../unipile.schema";

import { UnipileWebhookEnvelopeSchema } from "../unipile.schema";
import { UnmappableWebhookPayloadError } from "@/core/errors/app-errors";
import { isUnipileDisconnectedAccount, isUnipileProviderUnprocessable, isUnipileTimeout } from "../messaging.service";

export type UnipileWebhookHandlerMap = Partial<
  Record<string, { invoke(envelope: UnipileWebhookEnvelope): Promise<void> }>
>;

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

    const parsed = UnipileWebhookEnvelopeSchema.safeParse(row.payload);

    if (!parsed.success) {
      Sentry.captureException(parsed.error, { tags: { webhookEventId: id } });
      await this.events.markWebhookEventFailedUnscoped({ id, error: parsed.error.message, terminal: true });

      return;
    }

    const envelope = parsed.data;
    const handler = this.handlers[envelope.type];
    if (!handler) {
      Sentry.captureMessage(`Unipile v2 webhook: unhandled event type "${envelope.type}"`, {
        tags: { webhookEventId: id, eventType: envelope.type },
      });
      await this.events.markWebhookEventFailedUnscoped({
        id,
        error: `Unhandled event type: ${envelope.type}`,
        terminal: true,
      });

      return;
    }

    try {
      await handler.invoke(envelope);
      await this.events.markWebhookEventProcessedUnscoped(id);
    } catch (err) {
      if (err instanceof UnmappableWebhookPayloadError) {
        await this.events.markWebhookEventFailedUnscoped({
          id,
          error: err.message,
          terminal: true,
          unipileMessageId: err.unipileMessageId,
        });

        return;
      }

      if (isUnipileDisconnectedAccount(err)) {
        await this.events.markWebhookEventFailedUnscoped({ id, error: err.message, terminal: true });

        return;
      }

      if (isUnipileTimeout(err) || isUnipileProviderUnprocessable(err)) {
        await this.events.markWebhookEventFailedUnscoped({ id, error: (err as Error).message, terminal: false });

        return;
      }

      Sentry.captureException(err, { tags: { webhookEventId: id, eventType: envelope.type } });
      await this.events.markWebhookEventFailedUnscoped({
        id,
        error: err instanceof Error ? err.message : String(err),
        terminal: err instanceof z.ZodError,
      });
    }
  }
}
