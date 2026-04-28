import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { TaskType } from "@/generated/prisma";

export const NotesSchema = z.any().nullable().optional().describe("Markdown content");

export const OrganizationReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const UserReferenceSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.email(),
});

export const DealReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const ContactReferenceSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
});

export const ServiceReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  amount: z.number(),
  quantity: z.number(),
});

export const TaskReferenceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(TaskType),
});

export const CustomFieldValueSchema = z.object({
  columnId: z.uuid(),
  value: z.string().optional().nullable(),
});
export type CustomFieldValueDto = Data<typeof CustomFieldValueSchema>;
