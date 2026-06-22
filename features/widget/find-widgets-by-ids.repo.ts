export abstract class FindWidgetsByIdsRepo {
  abstract findIds(ids: Set<string>): Promise<Set<string>>;
}
