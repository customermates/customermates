import { z } from "zod";
import { Action, Resource } from "@/generated/prisma";
import { zx } from "@/core/validation/validation.utils";
import { RolePermissionsDtoSchema } from "./role.schema";
import { grantableActions, RESOURCE_ACCESS } from "./resource-access";

const uniqueActions = (actions: readonly Action[]) => new Set(actions).size === actions.length;

export const RoleResourceGrantSchema = z
  .object({
    resource: z.enum(Resource),
    actions: z.array(z.enum(Action)).max(5).refine(uniqueActions),
  })
  .strict()
  .refine(
    ({ resource, actions }) => {
      const grantable = grantableActions(RESOURCE_ACCESS[resource]);
      return actions.every((action) => grantable.includes(action));
    },
    { message: "Action is not applicable to this resource", path: ["actions"] },
  );

export const RoleRecordGrantSchema = z
  .object({
    typeId: z.uuid(),
    actions: z.array(z.enum(Action)).max(5).refine(uniqueActions),
  })
  .strict();

export const UpsertRoleSchema = z
  .object({
    id: z.uuid().optional(),
    name: zx.nonBlankText(255),
    description: zx.nonBlankText(500),
    permissions: z
      .array(RoleResourceGrantSchema)
      .max(Object.keys(RESOURCE_ACCESS).length)
      .describe(
        "Only listed resources change; each listed resource's actions replace its current actions and an empty actions array removes its access. Applicable actions per resource: api, users, wiki, inboxMessages and routines take create, update and delete; company and dataModel take update only; auditLog takes none. Read: readAll for every resource except company and dataModel, plus readOwn for users and routines. Any wiki manage action also grants readAll. Company and dataModel always keep their read rows, which make Settings and Subscription visible.",
      )
      .refine((grants) => new Set(grants.map((grant) => grant.resource)).size === grants.length),
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
