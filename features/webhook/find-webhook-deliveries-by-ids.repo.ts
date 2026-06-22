export abstract class FindWebhookDeliveriesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
