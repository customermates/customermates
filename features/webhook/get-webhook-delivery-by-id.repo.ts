export abstract class GetWebhookDeliveryByIdRepo {
  abstract createRetryById(
    id: string,
  ): Promise<
    | { status: "created"; id: string }
    | { status: "missing" }
    | { status: "unavailable" }
    | { status: "stale" }
    | { status: "forbidden" }
  >;
}
