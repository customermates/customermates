export abstract class FindContactsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Map<string, string>>;
}
