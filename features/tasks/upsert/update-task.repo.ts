import { type TaskDto } from "../task.schema";

import { type UpdateTaskData } from "./update-task.interactor";

export abstract class UpdateTaskRepo {
  abstract updateTaskOrThrow(args: UpdateTaskData): Promise<TaskDto>;
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<TaskDto[]>;
}
