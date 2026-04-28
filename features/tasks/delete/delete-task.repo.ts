import { type TaskDto } from "../task.schema";

export abstract class DeleteTaskRepo {
  abstract getOrThrowUnscoped(id: string): Promise<TaskDto>;
  abstract getManyOrThrowUnscoped(ids: string[]): Promise<TaskDto[]>;
  abstract deleteTaskOrThrow(id: string): Promise<TaskDto>;
}
