import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationUserRepo {
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
