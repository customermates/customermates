import type { RecordEventSubscription, Webhook, WebhookDelivery } from "@/generated/prisma";

export type WebhookDeliveryClaim =
  | { status: "missing" }
  | { status: "complete"; success: boolean }
  | { status: "deferred"; nextAttemptAt: Date }
  | { status: "claimed"; token: string; attempts: number };

export abstract class WebhookDeliveryQueueRepo {
  abstract claimUnscoped(companyId: string, deliveryId: string, now: Date): Promise<WebhookDeliveryClaim>;
  abstract contextUnscoped(
    companyId: string,
    deliveryId: string,
    token: string,
  ): Promise<{
    delivery: WebhookDelivery;
    webhook: Webhook | null;
    subscription: RecordEventSubscription | null;
  } | null>;
  abstract finishUnscoped(input: {
    companyId: string;
    deliveryId: string;
    token: string;
    success: boolean;
    statusCode: number | null;
    responseMessage: string;
    nextAttemptAt: Date | null;
  }): Promise<boolean>;
  abstract dueUnscoped(now: Date, take: number): Promise<Array<{ companyId: string; deliveryId: string }>>;
}
