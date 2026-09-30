import { z } from "zod";
import { Action } from "@/generated/prisma";
import { zx } from "@/core/validation/validation.utils";
import { RolePermissionsDtoSchema } from "./role.schema";

export const RoleSystemControlsSchema = z
  .object({
    users: z.object({ canManage: z.enum(["yes", "no"]), readAccess: z.enum(["none", "own", "all"]) }).strict(),
    company: z.object({ canManage: z.enum(["yes", "no"]) }).strict(),
    dataModel: z.object({ canManage: z.enum(["yes", "no"]) }).strict(),
    api: z.object({ canManage: z.enum(["yes", "no"]), readAccess: z.enum(["none", "all"]) }).strict(),
    inboxMessages: z.object({ canManage: z.enum(["yes", "no"]), readAccess: z.enum(["none", "all"]) }).strict(),
    auditLog: z.object({ readAccess: z.enum(["none", "all"]) }).strict(),
    routines: z.object({ canManage: z.enum(["yes", "no"]), readAccess: z.enum(["none", "own", "all"]) }).strict(),
  })
  .strict();

export type RoleSystemControls = z.infer<typeof RoleSystemControlsSchema>;
export const RoleSystemPermissionsSchema = z
  .object({
    users: RoleSystemControlsSchema.shape.users.partial().optional(),
    company: RoleSystemControlsSchema.shape.company.partial().optional(),
    dataModel: RoleSystemControlsSchema.shape.dataModel.partial().optional(),
    api: RoleSystemControlsSchema.shape.api.partial().optional(),
    inboxMessages: RoleSystemControlsSchema.shape.inboxMessages.partial().optional(),
    auditLog: RoleSystemControlsSchema.shape.auditLog.partial().optional(),
    routines: RoleSystemControlsSchema.shape.routines.partial().optional(),
  })
  .strict()
  .describe(
    "Only supplied system permission groups change. Omit unchanged groups or properties to preserve exact existing rights.",
  );

export const RoleRecordGrantSchema = z
  .object({
    typeId: z.uuid(),
    actions: z
      .array(z.enum(Action))
      .max(5)
      .refine((actions) => new Set(actions).size === actions.length),
  })
  .strict();

export const UpsertRoleSchema = z
  .object({
    id: z.uuid().optional(),
    name: zx.nonBlankText(255),
    description: zx.nonBlankText(500),
    permissions: RoleSystemPermissionsSchema,
    recordGrants: z
      .array(RoleRecordGrantSchema)
      .max(1000)
      .describe(
        "Only listed type grants change. An empty actions array removes that grant; omitted types keep existing access.",
      )
      .refine((grants) => new Set(grants.map((grant) => grant.typeId)).size === grants.length),
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: z.string().min(8).max(200),
  })
  .strict();
export type UpsertRoleData = z.infer<typeof UpsertRoleSchema>;

export const DeleteRoleSchema = z
  .object({
    id: z.uuid(),
    expectedRevision: UpsertRoleSchema.shape.expectedRevision,
    idempotencyKey: UpsertRoleSchema.shape.idempotencyKey,
  })
  .strict();
export type DeleteRoleData = z.infer<typeof DeleteRoleSchema>;

export const GetRoleEditorSchema = z
  .object({ id: z.uuid().optional(), typeIds: z.array(z.uuid()).max(100).optional() })
  .strict();
export const RoleEditorContextSchema = z
  .object({
    schemaRevision: z.number().int().nonnegative(),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
    role: RolePermissionsDtoSchema.nullable(),
    types: z.array(z.object({ id: z.uuid(), label: z.string(), archived: z.boolean() }).strict()),
  })
  .strict();
export type RoleEditorContext = z.infer<typeof RoleEditorContextSchema>;

export const RoleMutationResultSchema = z
  .object({
    role: RolePermissionsDtoSchema,
    schemaRevision: z.number().int().positive(),
  })
  .strict();
export type RoleMutationResult = z.infer<typeof RoleMutationResultSchema>;

export const RoleApiDtoSchema = RolePermissionsDtoSchema.extend({
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const RoleApiEditorContextSchema = RoleEditorContextSchema.extend({ role: RoleApiDtoSchema.nullable() });
export const RoleApiMutationResultSchema = RoleMutationResultSchema.extend({ role: RoleApiDtoSchema });
