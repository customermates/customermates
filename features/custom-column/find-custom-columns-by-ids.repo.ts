export abstract class FindCustomColumnsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
