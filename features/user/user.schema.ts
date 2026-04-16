import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Status, CountryCode } from "@/generated/prisma";

export const UserDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  roleId: z.uuid().nullable(),
  status: z.enum(Status),
  country: z.enum(CountryCode),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserDto = Data<typeof UserDtoSchema>;

export const UserByIdResponseSchema = z.object({
  user: UserDtoSchema.nullable(),
});
