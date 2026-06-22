export abstract class FindRolesByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
