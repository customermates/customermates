export abstract class FindServicesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
