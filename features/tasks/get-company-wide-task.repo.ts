import type { TaskDto } from "./task.schema";

export abstract class GetCompanyWideTaskRepo {
  abstract getOrThrowCompanyWide(id: string): Promise<TaskDto>;
  abstract getManyOrThrowCompanyWide(ids: string[]): Promise<TaskDto[]>;
}
