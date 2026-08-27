import { z } from "zod";

import {
  CUSTOM_COLUMN_PREREQ,
  CUSTOM_FIELDS_MERGE_NOTE,
  CreatedRecordsOutputSchema,
  toonResult,
  IDEMPOTENT_NOTE,
  UpdatedRecordsOutputSchema,
  forbidNullFields,
  relationsViaLinkNote,
  runInteractor,
} from "./utils";

import { getCreateManyOrganizationsInteractor, getUpdateManyOrganizationsInteractor } from "@/core/di";
import { BaseCreateOrganizationSchema } from "@/features/organizations/upsert/create-organization-base.schema";
import { BaseUpdateOrganizationSchema } from "@/features/organizations/upsert/update-organization-base.schema";

const CreateOrganizationsSchema = z.object({
  organizations: z.array(BaseCreateOrganizationSchema.strict()).min(1).max(100),
});

const UpdateOrganizationsSchema = z.object({
  organizations: z
    .array(
      forbidNullFields(
        BaseUpdateOrganizationSchema.omit({ contactIds: true, userIds: true, dealIds: true, taskIds: true }).strict(),
        ["customFieldValues"],
      ),
    )
    .min(1)
    .max(100),
});

export const createOrganizationsTool = {
  name: "create_organizations",
  title: "Create organizations",
  description:
    "Create up to 100 organizations in one call. " +
    "Required per item: name. " +
    "Optional per item: notes, contactIds, userIds, dealIds, taskIds, customFieldValues. " +
    "You can pass contactIds/userIds/dealIds/taskIds directly in create so linked orgs are created in one call. " +
    CUSTOM_COLUMN_PREREQ +
    " Returns the list of created organization ids and names.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  inputSchema: CreateOrganizationsSchema,
  outputSchema: CreatedRecordsOutputSchema,
  execute: (params: z.infer<typeof CreateOrganizationsSchema>) =>
    runInteractor(getCreateManyOrganizationsInteractor().invoke(params), (data) =>
      toonResult({ items: data.map((item) => ({ id: item.id, name: item.name })) }),
    ),
};

export const updateOrganizationsTool = {
  name: "update_organizations",
  title: "Update organizations",
  description:
    "Partial update for up to 100 organizations in one call. " +
    "Required per item: id. " +
    "Optional per item: name, notes, customFieldValues. " +
    relationsViaLinkNote("contacts, users, deals, tasks") +
    " " +
    CUSTOM_FIELDS_MERGE_NOTE +
    " " +
    IDEMPOTENT_NOTE,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  inputSchema: UpdateOrganizationsSchema,
  outputSchema: UpdatedRecordsOutputSchema,
  execute: (params: z.infer<typeof UpdateOrganizationsSchema>) =>
    runInteractor(
      getUpdateManyOrganizationsInteractor().invoke(params),
      (data) => `Updated ${data.length} organization(s)`,
      (data) => ({ updated: data.length }),
    ),
};
