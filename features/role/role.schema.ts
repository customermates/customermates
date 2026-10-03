import type { Data } from "@/core/validation/validation.utils";

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

export type RoleDto = Data<typeof RoleDtoSchema>;

export const RolePermissionsDtoSchema = RoleDtoSchema.extend({
  recordGrants: z.array(z.object({ typeId: z.uuid(), actions: z.array(z.enum(Action)) })).optional(),
});
export type RolePermissionsDto = z.infer<typeof RolePermissionsDtoSchema>;

export const RoleWithAssignmentsDtoSchema = RolePermissionsDtoSchema.extend({
  hasUsersAssigned: z.boolean(),
});

export type RoleWithAssignmentsDto = Data<typeof RoleWithAssignmentsDtoSchema>;
