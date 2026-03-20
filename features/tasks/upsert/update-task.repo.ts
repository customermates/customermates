import { type TaskDto } from "../task.schema";

import { type UpdateTaskData } from "./update-task.interactor";

export abstract class UpdateTaskRepo {
  abstract updateTaskOrThrow(args: UpdateTaskData): Promise<TaskDto>;
  abstract getTaskByIdOrThrow(id: string): Promise<TaskDto>;
}
