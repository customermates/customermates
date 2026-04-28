import type { TaskDto } from "./task.schema";

export abstract class GetUnscopedTaskRepo {
  abstract getOrThrowUnscoped(id: string): Promise<TaskDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<TaskDto[]>;
}
