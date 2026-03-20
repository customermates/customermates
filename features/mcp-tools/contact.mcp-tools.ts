import { z } from "zod";

import { encodeToToon } from "./utils";

import { di } from "@/core/dependency-injection/container";
import { CreateManyContactsInteractor } from "@/features/contacts/upsert/create-many-contacts.interactor";
import { UpdateManyContactsInteractor } from "@/features/contacts/upsert/update-many-contacts.interactor";
import { BaseCreateContactSchema } from "@/features/contacts/upsert/create-contact-base.schema";

const McpCreateManyContactsSchema = z.object({
  contacts: z.array(BaseCreateContactSchema).min(1).max(10),
});

const UpdateContactsNameSchema = z.object({
  contacts: z
    .array(
      z.object({
        id: z.uuid(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
      }),
    )
    .min(1)
    .max(10),
});

const ChangeContactsOrganizationsSchema = z.object({
  contacts: z
    .array(
      z.object({
        id: z.uuid(),
        organizationIds: z.array(z.uuid()),
      }),
    )
    .min(1)
    .max(10),
});

const ChangeContactsUsersSchema = z.object({
  contacts: z
    .array(
      z.object({
        id: z.uuid(),
        userIds: z.array(z.uuid()),
      }),
    )
    .min(1)
    .max(10),
});

const ChangeContactsDealsSchema = z.object({
  contacts: z
    .array(
      z.object({
        id: z.uuid(),
        dealIds: z.array(z.uuid()),
      }),
    )
    .min(1)
    .max(10),
});

export const createContactsTool = {
  name: "create_contacts",
  description: "Create contacts. Run get_contacts_configuration first. Required: firstName, lastName. Returns IDs.",
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  inputSchema: McpCreateManyContactsSchema,
  execute: async (params: z.infer<typeof McpCreateManyContactsSchema>) => {
    const result = await di.get(CreateManyContactsInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return encodeToToon(result.data.map((item) => item.id));
  },
};

export const updateContactNameTool = {
  name: "batch_update_contact_name",
  description: "Batch update: update contact firstName/lastName. Only updates provided fields.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateContactsNameSchema,
  execute: async (params: z.infer<typeof UpdateContactsNameSchema>) => {
    const result = await di.get(UpdateManyContactsInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};

export const setContactOrganizationsTool = {
  name: "batch_set_contact_organizations",
  description: "Batch update: sets (replaces) all organizations linked to a contact. Pass empty array to unlink all.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ChangeContactsOrganizationsSchema,
  execute: async (params: z.infer<typeof ChangeContactsOrganizationsSchema>) => {
    const result = await di.get(UpdateManyContactsInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};

export const setContactUsersTool = {
  name: "batch_set_contact_users",
  description: "Batch update: sets (replaces) all users assigned to a contact. Pass empty array to unassign all.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ChangeContactsUsersSchema,
  execute: async (params: z.infer<typeof ChangeContactsUsersSchema>) => {
    const result = await di.get(UpdateManyContactsInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};

export const setContactDealsTool = {
  name: "batch_set_contact_deals",
  description: "Batch update: sets (replaces) all deals linked to a contact. Pass empty array to unlink all.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: ChangeContactsDealsSchema,
  execute: async (params: z.infer<typeof ChangeContactsDealsSchema>) => {
    const result = await di.get(UpdateManyContactsInteractor).invoke(params);
    if (!result.ok) return `Validation error: ${z.prettifyError(result.error)}`;
    return `Updated ${result.data.length} contact(s)`;
  },
};
