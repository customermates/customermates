import { type TaskDto } from "../task.schema";

export abstract class DeleteTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<TaskDto[]>;
  abstract deleteTaskOrThrow(id: string): Promise<TaskDto>;
}
