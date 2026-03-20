export abstract class FindDealsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
