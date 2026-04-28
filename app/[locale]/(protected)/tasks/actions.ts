"use server";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { DeleteTaskData } from "@/features/tasks/delete/delete-task.interactor";
import type { GetTaskByIdData } from "@/features/tasks/get/get-task-by-id.interactor";
import type { CreateTaskData } from "@/features/tasks/upsert/create-task.interactor";
import type { UpdateTaskData } from "@/features/tasks/upsert/update-task.interactor";

import {
  getGetTasksInteractor,
  getGetTaskByIdInteractor,
  getCountUserTasksInteractor,
  getCreateTaskInteractor,
  getUpdateTaskInteractor,
  getDeleteTaskInteractor,
} from "@/core/di";
import { serializeResult } from "@/core/utils/action-result";

export async function refreshTasksAction(params?: GetQueryParams) {
  const result = await getGetTasksInteractor().invoke(params);
  return result.ok ? result.data : { items: [] };
}

export const getTasksAction = refreshTasksAction;

export async function createTaskByNameAction(name: string, userId: string | null | undefined) {
  const result = await createTaskAction({
    name,
    notes: null,
    userIds: userId ? [userId] : [],
    contactIds: [],
    organizationIds: [],
    dealIds: [],
    serviceIds: [],
    customFieldValues: [],
  });
  return result.ok ? result.data : null;
}

export async function refreshTaskCountAction() {
  const result = await getCountUserTasksInteractor().invoke();
  return result.data;
}

export async function createTaskAction(data: CreateTaskData) {
  return serializeResult(getCreateTaskInteractor().invoke(data));
}

export async function updateTaskAction(data: UpdateTaskData) {
  return serializeResult(getUpdateTaskInteractor().invoke(data));
}

export async function deleteTaskAction(data: DeleteTaskData) {
  return getDeleteTaskInteractor().invoke(data);
}

export async function getTaskByIdAction(data: GetTaskByIdData) {
  const result = await getGetTaskByIdInteractor().invoke(data);
  return result.ok
    ? { entity: result.data.task, customColumns: result.data.customColumns }
    : { entity: null, customColumns: [] };
}
