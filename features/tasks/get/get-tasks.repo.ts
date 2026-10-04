import { type TaskDto } from "../task.schema";
import { BaseGetRepo } from "@/core/base/base-get.repo";

export abstract class GetTasksRepo extends BaseGetRepo<TaskDto> {}
