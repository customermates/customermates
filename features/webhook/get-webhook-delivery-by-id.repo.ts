export abstract class GetWebhookDeliveryByIdRepo {
  abstract createRetryById(
    id: string,
    webhookId?: string,
  ): Promise<
    | { status: "created"; id: string }
    | { status: "missing" }
    | { status: "in_progress" }
    | { status: "webhook_disabled" }
    | { status: "unavailable" }
    | { status: "stale" }
    | { status: "forbidden" }
  >;
}
