import { type TaskDto } from "../task.schema";

export abstract class DeleteTaskRepo {
  abstract deleteTaskOrThrow(id: string): Promise<TaskDto>;
}
