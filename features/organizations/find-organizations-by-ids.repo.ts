export abstract class FindOrganizationsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
