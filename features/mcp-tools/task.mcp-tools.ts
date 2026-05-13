import { z } from "zod";

import { encodeToToon, forbidNullFields, NO_NULL_WIPE_WARNING } from "./utils";

import { getCreateManyTasksInteractor, getUpdateManyTasksInteractor } from "@/core/app-di";
import { BaseCreateTaskSchema } from "@/features/tasks/upsert/create-task-base.schema";
import { BaseUpdateTaskSchema } from "@/features/tasks/upsert/update-task-base.schema";

const TASK_WIPE_GUARDED_FIELDS = [
  "userIds",
  "contactIds",
  "organizationIds",
  "dealIds",
  "serviceIds",
  "customFieldValues",
] as const;

const CreateTasksSchema = z.object({
  tasks: z.array(BaseCreateTaskSchema).min(1).max(100),
});

const UpdateTasksSchema = z.object({
  tasks: z.array(forbidNullFields(BaseUpdateTaskSchema, TASK_WIPE_GUARDED_FIELDS)).min(1).max(100),
});

export const createTasksTool = {
  name: "create_tasks",
  description:
    "Create up to 100 tasks in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, userIds, contactIds, organizationIds, dealIds, serviceIds, customFieldValues. " +
    "You can pass contactIds/organizationIds/dealIds/serviceIds directly in create to link the task to those entities in one call. " +
    "Prereq: call get_entity_configuration for custom-column ids. " +
    "Returns the list of created task ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateTasksSchema,
  execute: async (params: z.infer<typeof CreateTasksSchema>) => {
    const result = await getCreateManyTasksInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon({
      items: result.data.map((item) => ({ id: item.id, name: item.name })),
    });
  },
};

export const updateTasksTool = {
  name: "update_tasks",
  description:
    "Partial update for up to 100 tasks in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, userIds, contactIds, organizationIds, dealIds, serviceIds, customFieldValues. " +
    "WARNING: if you pass userIds, contactIds, organizationIds, dealIds, or serviceIds, the array REPLACES existing links (any id not in the array is unlinked). " +
    "To ADD or REMOVE a single link without touching the rest, use link_entities or unlink_entities instead. " +
    NO_NULL_WIPE_WARNING +
    " Idempotent: same payload produces the same state.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateTasksSchema,
  execute: async (params: z.infer<typeof UpdateTasksSchema>) => {
    const result = await getUpdateManyTasksInteractor().invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} task(s)`;
  },
};
