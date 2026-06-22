export abstract class FindWebhooksByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
