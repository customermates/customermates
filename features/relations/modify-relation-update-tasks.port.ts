import type { UpdateManyTasksData } from "@/features/tasks/upsert/update-many-tasks.interactor";
import type { TaskDto } from "@/features/tasks/task.schema";
import type { Validated } from "@/core/validation/validation.utils";

export abstract class ModifyRelationUpdateTasksPort {
  abstract invoke(data: UpdateManyTasksData): Validated<TaskDto[]>;
}
