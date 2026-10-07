import { z } from "zod";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Enforce } from "@/core/decorators/enforce.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import type { RecordRecipientReader } from "@/features/records/record-recipient-reader";
import type { WebhookDeliveryQueueRepo } from "./webhook-delivery-queue.repo";
import type { WebhookTransport, WebhookTransportResult } from "./webhook-transport.service";
import { eventEnvelope, type EventEnvelope } from "@/features/event/event-envelope";
import { parseStoredWebhookHeaders } from "./webhook-headers";

export { WEBHOOK_PREFLIGHT_FAILURE_STATUS } from "./webhook-transport.service";

const Schema = z.object({ deliveryId: z.uuid(), companyId: z.uuid() });
export type DeliverWebhookPayload = z.infer<typeof Schema>;
export type DeliveryOutcome = {
  status: "success" | "failed" | "pending" | "missing";
  statusCode: number | null;
  responseMessage: string | null;
  nextAttemptAt?: string;
};
const RETRYABLE_4XX = new Set([408, 425, 429]);
const MAX_ATTEMPTS = 10;

@SystemInteractor
export class DeliverWebhookInteractor {
  constructor(
    private readonly queue: WebhookDeliveryQueueRepo,
    private readonly reader: RecordRecipientReader,
    private readonly transport: WebhookTransport,
  ) {}

  @Enforce(Schema)
  async invoke(input: DeliverWebhookPayload): Promise<DeliveryOutcome> {
    const claim = await this.queue.claimUnscoped(input.companyId, input.deliveryId, new Date());
    if (claim.status === "missing") return { status: "missing", statusCode: null, responseMessage: null };
    if (claim.status === "complete")
      return { status: claim.success ? "success" : "failed", statusCode: null, responseMessage: null };
    if (claim.status === "deferred") {
      return {
        status: "pending",
        statusCode: null,
        responseMessage: null,
        nextAttemptAt: claim.nextAttemptAt.toISOString(),
      };
    }
    const prepared = await runInTransaction(
      async () => {
        const state = await this.queue.contextUnscoped(input.companyId, input.deliveryId, claim.token);
        if (!state) return null;
        const { delivery, webhook, event, subscription } = state;
        if (
          !webhook ||
          !event ||
          !webhook.enabled ||
          webhook.url !== delivery.url ||
          !webhook.events.includes(delivery.event)
        )
          return null;
        let requestBody: EventEnvelope | null = eventEnvelope(event);
        if (event.subjectKind === "record") {
          if (!subscription || !subscription.enabled || subscription.revision !== delivery.subscriptionRevision)
            return null;
          requestBody = await this.reader.readEvent({
            companyId: input.companyId,
            userId: subscription.ownerUserId,
            eventId: event.id,
            subscriptionId: webhook.id,
          });
        }
        if (!requestBody) return null;
        return {
          deliveryId: delivery.id,
          url: webhook.url,
          secret: webhook.secret,
          headers: parseStoredWebhookHeaders(webhook.headers),
          bodyTemplate: webhook.bodyTemplate,
          requestBody,
        };
      },
      { companyId: input.companyId, readOnly: true, timeout: 30000 },
    );
    const result: WebhookTransportResult = prepared
      ? await this.transport.post(prepared)
      : {
          success: false,
          statusCode: 422,
          responseMessage: "Webhook configuration or current record access is unavailable",
        };
    const retryable = result.statusCode === null || result.statusCode >= 500 || RETRYABLE_4XX.has(result.statusCode);
    const nextAttemptAt =
      !result.success && retryable && claim.attempts < MAX_ATTEMPTS
        ? new Date(Date.now() + Math.min(3_600_000, 1000 * 2 ** (claim.attempts - 1)))
        : null;
    const settled = await this.queue.finishUnscoped({
      companyId: input.companyId,
      deliveryId: input.deliveryId,
      token: claim.token,
      ...result,
      nextAttemptAt,
    });
    if (!settled) return { status: "pending", statusCode: null, responseMessage: "Delivery lease changed" };
    return {
      status: result.success ? "success" : "failed",
      statusCode: result.statusCode,
      responseMessage: result.responseMessage,
      ...(nextAttemptAt ? { nextAttemptAt: nextAttemptAt.toISOString() } : {}),
    };
  }
}
