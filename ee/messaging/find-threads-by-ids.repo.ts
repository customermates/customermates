export abstract class FindThreadsByIdsRepo {
  abstract findThreadIds(ids: Set<string>): Promise<Set<string>>;
}
