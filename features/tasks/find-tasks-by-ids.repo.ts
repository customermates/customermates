export abstract class FindTasksByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
  abstract findSystemTaskIds(ids: Set<string>): Promise<Set<string>>;
}
