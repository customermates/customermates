export abstract class GetWebhookDeliveryByIdRepo {
  abstract createRetryById(
    id: string,
    webhookId?: string,
  ): Promise<
    | { status: "created"; id: string }
    | { status: "missing" }
    | { status: "unavailable" }
    | { status: "stale" }
    | { status: "forbidden" }
  >;
}
