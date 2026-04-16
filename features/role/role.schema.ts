import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

export const RoleDtoSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isSystemRole: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
  permissions: z.array(
    z.object({
      id: z.string(),
      resource: z.enum(Resource),
      action: z.enum(Action),
    }),
  ),
});
