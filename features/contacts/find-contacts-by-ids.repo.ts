export abstract class FindContactsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
