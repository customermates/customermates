import { z } from "zod";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

import {
  getDisablePublicFormInteractor,
  getGetPublicFormEditorInteractor,
  getGetPublicFormInteractor,
  getListPublicFormsInteractor,
  getUpsertPublicFormInteractor,
} from "@/core/di";
import {
  DisablePublicFormSchema,
  GetPublicFormEditorSchema,
  GetPublicFormSchema,
  ListPublicFormsSchema,
  PublicFormConfigSchema,
  UpsertPublicFormSchema,
} from "@/features/public-form/public-form.schema";

const FORM_ACTIONS = ["list", "get", "fields", "create", "update", "disable"] as const;

const ManageFormsSchema = z.object({
  action: z
    .enum(FORM_ACTIONS)
    .describe(
      "Form operation. Keys per action: list: typeId; get: id; fields: typeId; create: typeId, name, config, enabled; update: id, name, config, enabled; disable: id.",
    ),
  id: z.uuid().optional().describe("The form id. Required for get, update and disable."),
  typeId: z
    .uuid()
    .optional()
    .describe("The list the form belongs to. Required for fields and create; optional for list."),
  name: z.string().optional().describe("Internal name of the form, shown as the source of the records it creates."),
  enabled: z
    .boolean()
    .optional()
    .describe("create (default true) and update. Turning a form on needs public links allowed."),
  config: PublicFormConfigSchema.optional().describe(
    "The full form definition: title, description, submitLabel, fields (fieldId, label, helpText, required), person (find or create a person by email and link it), consent (text and privacyUrl), success (message and redirectUrl) and locale. Required for create; on update it replaces the stored definition.",
  ),
});

type ManageFormsParams = z.infer<typeof ManageFormsSchema>;

const ManageFormsOutputSchema = z
  .looseObject({
    items: z.array(z.looseObject({ id: z.string() })).optional(),
    id: z.string().optional(),
    url: z.string().optional(),
    enabled: z.boolean().optional(),
    fields: z.array(z.looseObject({ fieldId: z.string() })).optional(),
  })
  .describe(
    "list returns items; get, create, update and disable return the form with its public url and embedSnippet; fields returns the fields a form can use and the people lists it can link to.",
  );

export const manageFormsTool = {
  name: "manage_forms",
  title: "Manage public forms",
  description:
    "Use this when you need to publish or change a public form that lets anyone outside the workspace add a record to a list without signing in. " +
    "Each list has at most one form. Submissions create a record in that list as the member who last turned the form on, with the form named as its source in the record's activity; an optional linked person is found or created by email (one person per email). " +
    "action fields lists the fields a form can use (input fields of type text, formatted text, number, currency, yes/no, date, single or multiple choice, link and contact details) and the people lists it can link to; read it before create. " +
    "action create requires typeId, name and config. action update requires id and replaces config when given. action disable turns the form off at once; the same link works again after update with enabled true. " +
    "Free plan forms accept a monthly number of submissions and show a Made with Customermates badge; paid plans and self-hosted workspaces have neither. A workspace administrator can turn public links and forms off in the workspace settings. " +
    "Each get, create and update result carries url, the public link, and embedSnippet, an iframe to paste into a web page. Visitors only ever see the questions in config.fields, never other fields of the record.",
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  inputSchema: ManageFormsSchema,
  outputSchema: ManageFormsOutputSchema,
  execute: async (params: ManageFormsParams) => {
    switch (params.action) {
      case "list": {
        const parsed = ListPublicFormsSchema.safeParse({ typeId: params.typeId });
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        return runInteractor(getListPublicFormsInteractor().invoke(parsed.data), (data) =>
          toonResult({ items: data.items }),
        );
      }
      case "get": {
        const parsed = GetPublicFormSchema.safeParse({ id: params.id });
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        return runInteractor(getGetPublicFormInteractor().invoke(parsed.data), (data) => toonResult({ ...data }));
      }
      case "fields": {
        const parsed = GetPublicFormEditorSchema.safeParse({ typeId: params.typeId });
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        return runInteractor(getGetPublicFormEditorInteractor().invoke(parsed.data), (data) => toonResult({ ...data }));
      }
      case "disable": {
        const parsed = DisablePublicFormSchema.safeParse({ id: params.id });
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        return runInteractor(getDisablePublicFormInteractor().invoke(parsed.data), (data) => toonResult({ ...data }));
      }
      case "create":
      case "update": {
        const parsed = UpsertPublicFormSchema.safeParse({
          ...(params.action === "update" ? { id: params.id } : { typeId: params.typeId }),
          name: params.name,
          enabled: params.enabled,
          config: params.config,
        });
        if (!parsed.success) return mcpValidationFailure(parsed.error);
        return runInteractor(getUpsertPublicFormInteractor().invoke(parsed.data), (data) => toonResult({ ...data }));
      }
    }
  },
};
