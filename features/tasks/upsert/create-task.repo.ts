import { type TaskDto } from "../task.schema";

import { type CreateTaskData } from "./create-task.interactor";

export abstract class CreateTaskRepo {
  abstract createTaskOrThrow(args: CreateTaskData): Promise<TaskDto>;
}
