import * as Sentry from "@sentry/nextjs";

import type { FindAccountByUnipileIdUnscopedRepo } from "../persistence/find-account-by-unipile-id-unscoped.repo";
import type { ProcessUnipileWebhookInteractor } from "./process-unipile-webhook.interactor";
import type { WebhookEventRepo } from "./webhook-event.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { UnipileWebhookEnvelopeSchema } from "../unipile.schema";
import { WEBHOOK_INBOUND_SOURCE } from "./webhook-event.repo";

@SystemInteractor
export class IngestUnipileWebhookInteractor {
  constructor(
    private events: WebhookEventRepo,
    private accountRepo: FindAccountByUnipileIdUnscopedRepo,
    private process: ProcessUnipileWebhookInteractor,
  ) {}

  async invoke(body: unknown): Promise<void> {
    const parsed = UnipileWebhookEnvelopeSchema.safeParse(body);
    const envelope = parsed.success ? parsed.data : null;
    const account = envelope?.account_id
      ? await this.accountRepo.findAccountByUnipileIdUnscoped(envelope.account_id)
      : null;
    const companyId = account?.companyId ?? null;

    const { id } = await this.events.createWebhookEventUnscoped({
      companyId,
      source: WEBHOOK_INBOUND_SOURCE,
      eventType: envelope?.type ?? null,
      accountId: envelope?.account_id ?? null,
      payload: body,
    });

    if (!envelope) {
      Sentry.captureException(new Error("Unipile v2 webhook: unrecognized envelope shape (persisted for reprocess)"), {
        tags: { companyId, webhookEventId: id },
      });

      return;
    }

    try {
      await this.process.invoke({ id });
    } catch (err) {
      Sentry.captureException(err, {
        tags: { eventType: envelope.type, unipileAccountId: envelope.account_id, companyId, webhookEventId: id },
      });
    }
  }
}
