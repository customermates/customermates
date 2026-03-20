"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteTaskData } from "@/features/tasks/delete/delete-task.interactor";
import type { GetTaskByIdData } from "@/features/tasks/get/get-task-by-id.interactor";
import type { CreateTaskData } from "@/features/tasks/upsert/create-task.interactor";
import type { UpdateTaskData } from "@/features/tasks/upsert/update-task.interactor";

import { di } from "@/core/dependency-injection/container";
import { CountUserTasksInteractor } from "@/features/tasks/count-user-tasks.interactor";
import { GetTasksInteractor } from "@/features/tasks/get/get-tasks.interactor";
import { CreateTaskInteractor } from "@/features/tasks/upsert/create-task.interactor";
import { UpdateTaskInteractor } from "@/features/tasks/upsert/update-task.interactor";
import { DeleteTaskInteractor } from "@/features/tasks/delete/delete-task.interactor";
import { GetTaskByIdInteractor } from "@/features/tasks/get/get-task-by-id.interactor";
import { serializeResult } from "@/core/utils/action-result";

export async function refreshTasksAction(params?: GetQueryParams) {
  const result = await di.get(GetTasksInteractor).invoke(params);
  return result.ok ? result.data : { items: [] };
}

export async function refreshTaskCountAction() {
  return await di.get(CountUserTasksInteractor).invoke();
}

export async function createTaskAction(data: CreateTaskData) {
  return serializeResult(di.get(CreateTaskInteractor).invoke(data));
}

export async function updateTaskAction(data: UpdateTaskData) {
  return serializeResult(di.get(UpdateTaskInteractor).invoke(data));
}

export async function deleteTaskAction(data: DeleteTaskData) {
  return di.get(DeleteTaskInteractor).invoke(data);
}

export async function getTaskByIdAction(data: GetTaskByIdData) {
  const result = await di.get(GetTaskByIdInteractor).invoke(data);
  return result.ok
    ? { entity: result.data.task, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}
