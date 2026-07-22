export abstract class FindConnectedAccountsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
