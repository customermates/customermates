import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { TaskType } from "@/generated/prisma";

import { CustomFieldValueSchema, UserReferenceSchema, NotesSchema } from "@/core/base/base-entity.schema";

export const TaskDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(TaskType),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  users: z.array(UserReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this task. Query available custom field configurations via GET /v1/tasks/configuration, which returns customColumns with their definitions.",
    ),
});

export type TaskDto = Data<typeof TaskDtoSchema>;
