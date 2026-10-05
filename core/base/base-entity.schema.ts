import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

export const UserReferenceSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.email(),
});

export const CustomFieldValueSchema = z.object({
  columnId: z.uuid(),
  value: z.string().nullish(),
});
export type CustomFieldValueDto = Data<typeof CustomFieldValueSchema>;
