import type { TaskDto } from "@/features/tasks/task.schema";
import type { ReadableIds } from "./modify-entity-relation.interactor";

export abstract class ModifyRelationTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract findIds(ids: Set<string>): Promise<ReadableIds>;
}
