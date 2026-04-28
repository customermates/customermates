import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { TaskType } from "@/generated/prisma";

import {
  CustomFieldValueSchema,
  UserReferenceSchema,
  ContactReferenceSchema,
  OrganizationReferenceSchema,
  DealReferenceSchema,
  NotesSchema,
} from "@/core/base/base-entity.schema";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const TaskServiceReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  amount: z.number(),
});

export const TaskDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(TaskType),
  notes: NotesSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
  users: z.array(UserReferenceSchema),
  contacts: z.array(ContactReferenceSchema),
  organizations: z.array(OrganizationReferenceSchema),
  deals: z.array(DealReferenceSchema),
  services: z.array(TaskServiceReferenceSchema),
  customFieldValues: z
    .array(CustomFieldValueSchema)
    .describe(
      "Custom field values for this task. Query available custom field configurations via GET /v1/tasks/configuration, which returns customColumns with their definitions.",
    ),
});

export type TaskDto = Data<typeof TaskDtoSchema>;

export const TaskByIdResponseSchema = z.object({
  task: TaskDtoSchema.nullable(),
  customColumns: z.array(CustomColumnDtoSchema),
});
