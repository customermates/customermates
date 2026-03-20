export abstract class FindUsersByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
