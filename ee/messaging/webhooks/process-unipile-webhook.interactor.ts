import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";

import { z } from "zod";
import * as ErrorReporter from "@/core/observability/server";

import { WEBHOOK_REPROCESS_MAX_ATTEMPTS, type WebhookEventRepo } from "./webhook-event.repo";
import type { UnipileWebhookEnvelope } from "../unipile.schema";

import { UnipileWebhookEnvelopeSchema } from "../unipile.schema";
import { DeferredWebhookError, UnmappableWebhookPayloadError } from "@/core/errors/app-errors";
import {
  isUnipileDisconnectedAccount,
  isUnipileProviderUnprocessable,
  isUnipileTimeout,
  isUnipileTransientError,
} from "../messaging.service";
import { UnipileRequestError } from "../unipile-request-error";

type DispatchedEnvelope = UnipileWebhookEnvelope & { receivedAt?: Date; connectedAccountId?: string };

export type UnipileWebhookHandlerMap = Partial<Record<string, { invoke(envelope: DispatchedEnvelope): Promise<void> }>>;

const ACCOUNT_CREATING_EVENTS = new Set(["account.add"]);

const Schema = z.object({ id: z.uuid() });
type ProcessUnipileWebhookPayload = z.infer<typeof Schema>;

function isUnipileApiRateLimit(err: unknown): boolean {
  return err instanceof UnipileRequestError && err.status === 429 && !err.errorType?.startsWith("provider/");
}

function isRetryableUnipileWebhookError(err: unknown): boolean {
  return err instanceof UnipileRequestError && (err.status === 429 || isUnipileTransientError(err));
}

@SystemInteractor
export class ProcessUnipileWebhookInteractor {
  constructor(
    private events: WebhookEventRepo,
    private handlers: UnipileWebhookHandlerMap,
  ) {}

  @Enforce(Schema)
  async invoke({ id }: ProcessUnipileWebhookPayload): Promise<{ rateLimited: boolean }> {
    const row = await this.events.findWebhookEventByIdOrThrowUnscoped(id);
    if (row.processed) return { rateLimited: false };

    const parsed = UnipileWebhookEnvelopeSchema.safeParse(row.payload);

    if (!parsed.success) {
      ErrorReporter.captureException(parsed.error, { tags: { webhookEventId: id } });
      await this.events.markWebhookEventFailedUnscoped({ id, error: parsed.error.message, terminal: true });

      return { rateLimited: false };
    }

    const envelope = parsed.data;
    const handler = this.handlers[envelope.type];
    if (!handler) {
      ErrorReporter.captureMessage(`Unipile v2 webhook: unhandled event type "${envelope.type}"`, {
        tags: { webhookEventId: id, eventType: envelope.type },
      });
      await this.events.markWebhookEventFailedUnscoped({
        id,
        error: `Unhandled event type: ${envelope.type}`,
        terminal: true,
      });

      return { rateLimited: false };
    }

    try {
      for (const target of await this.targets(envelope))
        await handler.invoke({ ...envelope, receivedAt: row.receivedAt, ...target });
      await this.events.markWebhookEventProcessedUnscoped(id);
      return { rateLimited: false };
    } catch (err) {
      if (err instanceof UnmappableWebhookPayloadError) {
        await this.events.markWebhookEventFailedUnscoped({
          id,
          error: err.message,
          terminal: true,
          unipileMessageId: err.unipileMessageId,
        });

        return { rateLimited: false };
      }

      if (err instanceof DeferredWebhookError) {
        await this.markRetryableFailure({ id, eventType: envelope.type, err });

        return { rateLimited: false };
      }

      if (isUnipileDisconnectedAccount(err)) {
        await this.events.markWebhookEventFailedUnscoped({ id, error: err.message, terminal: true });

        return { rateLimited: false };
      }

      if (isUnipileTimeout(err) || isUnipileProviderUnprocessable(err) || isRetryableUnipileWebhookError(err)) {
        await this.markRetryableFailure({ id, eventType: envelope.type, err });

        return { rateLimited: isUnipileApiRateLimit(err) };
      }

      ErrorReporter.captureException(err, { tags: { webhookEventId: id, eventType: envelope.type } });
      await this.events.markWebhookEventFailedUnscoped({
        id,
        error: err instanceof Error ? err.message : String(err),
        terminal: err instanceof z.ZodError,
      });

      return { rateLimited: false };
    }
  }

  private async targets(envelope: UnipileWebhookEnvelope): Promise<Array<{ connectedAccountId?: string }>> {
    if (!envelope.account_id || ACCOUNT_CREATING_EVENTS.has(envelope.type)) return [{}];
    const ids = await this.events.listConnectedAccountIdsUnscoped(envelope.account_id);

    return ids.length === 0 ? [{}] : ids.map((connectedAccountId) => ({ connectedAccountId }));
  }

  private async markRetryableFailure(args: { id: string; eventType: string; err: unknown }): Promise<void> {
    const result = await this.events.markWebhookEventFailedUnscoped({
      id: args.id,
      error: args.err instanceof Error ? args.err.message : String(args.err),
      terminal: false,
    });
    if (result.attemptCount !== WEBHOOK_REPROCESS_MAX_ATTEMPTS) return;

    ErrorReporter.captureException(args.err, {
      tags: {
        eventType: args.eventType,
        webhookEventId: args.id,
        webhookRetryExhausted: "true",
      },
    });
  }
}
