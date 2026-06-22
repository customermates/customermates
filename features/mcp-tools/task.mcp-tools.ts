import { z } from "zod";

import {
  encodeToToon,
  forbidNullFields,
  runInteractor,
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  IDEMPOTENT_NOTE,
  relationsViaLinkNote,
} from "./utils";

import { getCreateManyTasksInteractor, getUpdateManyTasksInteractor } from "@/core/di";
import { BaseCreateTaskSchema } from "@/features/tasks/upsert/create-task-base.schema";
import { BaseUpdateTaskSchema } from "@/features/tasks/upsert/update-task-base.schema";

const CreateTasksSchema = z.object({
  tasks: z.array(BaseCreateTaskSchema).min(1).max(100),
});

const UpdateTasksSchema = z.object({
  tasks: z
    .array(
      forbidNullFields(
        BaseUpdateTaskSchema.omit({
          userIds: true,
          contactIds: true,
          organizationIds: true,
          dealIds: true,
          serviceIds: true,
        }),
        ["customFieldValues"],
      ),
    )
    .min(1)
    .max(100),
});

export const createTasksTool = {
  name: "create_tasks",
  description:
    "Create up to 100 tasks in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, userIds, contactIds, organizationIds, dealIds, serviceIds, customFieldValues. " +
    "You can pass userIds/contactIds/organizationIds/dealIds/serviceIds directly in create to link the task to those entities in one call. " +
    CUSTOM_COLUMN_PREREQ +
    " Returns the list of created task ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: CreateTasksSchema,
  execute: (params: z.infer<typeof CreateTasksSchema>) =>
    runInteractor(getCreateManyTasksInteractor().invoke(params), (data) =>
      encodeToToon({ items: data.map((item) => ({ id: item.id, name: item.name })) }),
    ),
};

export const updateTasksTool = {
  name: "update_tasks",
  description:
    "Partial update for up to 100 tasks in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, customFieldValues. " +
    relationsViaLinkNote("users, contacts, organizations, deals, services") +
    " " +
    CUSTOM_FIELDS_MERGE_NOTE +
    " " +
    IDEMPOTENT_NOTE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateTasksSchema,
  execute: (params: z.infer<typeof UpdateTasksSchema>) =>
    runInteractor(getUpdateManyTasksInteractor().invoke(params), (data) => `Updated ${data.length} task(s)`),
};
