import { z } from "zod";

import { isAppLocale } from "@/i18n/locale-registry";

import { FORM_FIELD_VALUE_TYPES } from "./public-form-fields";
import { PUBLIC_FORM_LIMITS } from "./public-form-limits";

const HttpUrlSchema = z.url({ protocol: /^https?$/ }).max(2000);

const FormTextSchema = (max: number) => z.string().trim().min(1).max(max);

export const PublicFormFieldConfigSchema = z
  .object({
    fieldId: z.uuid().describe("A field of the list. Only input fields of the supported types can be used."),
    label: FormTextSchema(120).describe("The question shown to the visitor."),
    helpText: z.string().trim().max(300).nullable().describe("Short hint under the input, or null."),
    required: z.boolean(),
  })
  .strict();
export type PublicFormFieldConfig = z.infer<typeof PublicFormFieldConfigSchema>;

export const PublicFormPersonSchema = z
  .object({
    typeId: z.uuid().describe("The list that holds people. It needs a contact details field."),
    relationshipId: z.uuid().describe("A relationship between the form's list and the people list."),
    emailLabel: FormTextSchema(120),
    nameLabel: FormTextSchema(120).nullable().describe("Label of the optional name input, or null for no name input."),
    nameFieldId: z
      .uuid()
      .nullable()
      .describe("The text field of the people list that receives the name. Null stores no name."),
  })
  .strict();
export type PublicFormPerson = z.infer<typeof PublicFormPersonSchema>;

export const PublicFormConsentSchema = z
  .object({
    text: FormTextSchema(600).describe("The sentence the visitor agrees to. A change creates a new consent version."),
    privacyUrl: HttpUrlSchema.describe("Link to the owner's privacy notice."),
  })
  .strict();
export type PublicFormConsent = z.infer<typeof PublicFormConsentSchema>;

export const PublicFormSuccessSchema = z
  .object({
    message: FormTextSchema(500),
    redirectUrl: HttpUrlSchema.nullable().describe(
      "Where to send the visitor after sending, or null to show the message.",
    ),
  })
  .strict();

export const PublicFormConfigSchema = z
  .object({
    title: FormTextSchema(120),
    description: z.string().trim().max(600).nullable(),
    submitLabel: FormTextSchema(60),
    fields: z
      .array(PublicFormFieldConfigSchema)
      .min(1)
      .max(PUBLIC_FORM_LIMITS.maxFields)
      .refine((fields) => new Set(fields.map((field) => field.fieldId)).size === fields.length, {
        message: "Each field can appear once",
      }),
    person: PublicFormPersonSchema.nullable(),
    consent: PublicFormConsentSchema.nullable(),
    success: PublicFormSuccessSchema,
    locale: z
      .string()
      .refine(isAppLocale, { message: "Unknown language" })
      .nullable()
      .describe("The language of the page, or null to follow the visitor's browser."),
  })
  .strict();
export type PublicFormConfig = z.infer<typeof PublicFormConfigSchema>;

export const PublicFormUsageSchema = z
  .object({
    submissionsThisMonth: z.number().int(),
    monthlyLimit: z.number().int().nullable(),
    badge: z.boolean(),
  })
  .strict();
export type PublicFormUsage = z.infer<typeof PublicFormUsageSchema>;

export const PublicFormDtoSchema = z
  .object({
    id: z.uuid(),
    typeId: z.uuid(),
    name: z.string(),
    enabled: z.boolean(),
    url: z.string(),
    embedSnippet: z.string(),
    config: PublicFormConfigSchema,
    consentVersion: z.number().int(),
    submissionCount: z.number().int(),
    lastSubmittedAt: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
    usage: PublicFormUsageSchema,
  })
  .strict();
export type PublicFormDto = z.infer<typeof PublicFormDtoSchema>;

export const ListPublicFormsSchema = z
  .object({ typeId: z.uuid().optional().describe("Only the form of this list.") })
  .strict();
export type ListPublicFormsData = z.infer<typeof ListPublicFormsSchema>;

export const PublicFormListResultSchema = z.object({ items: z.array(PublicFormDtoSchema) }).strict();
export type PublicFormListResult = z.infer<typeof PublicFormListResultSchema>;

export const GetPublicFormSchema = z.object({ id: z.uuid() }).strict();
export type GetPublicFormData = z.infer<typeof GetPublicFormSchema>;

export const UpsertPublicFormSchema = z
  .object({
    id: z.uuid().optional().describe("Omit to create the form of a list."),
    typeId: z.uuid().optional().describe("Required to create: the list whose records the form creates."),
    name: FormTextSchema(120).optional().describe("Internal name; shown in the activity of created records."),
    enabled: z.boolean().optional(),
    config: PublicFormConfigSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.id) return;
    for (const key of ["typeId", "name", "config"] as const)
      if (data[key] === undefined) ctx.addIssue({ code: "custom", path: [key], message: "Required to create a form" });
  });
export type UpsertPublicFormData = z.infer<typeof UpsertPublicFormSchema>;

export const DisablePublicFormSchema = z.object({ id: z.uuid() }).strict();
export type DisablePublicFormData = z.infer<typeof DisablePublicFormSchema>;

export const FormFieldOptionSchema = z
  .object({
    fieldId: z.uuid(),
    label: z.string(),
    valueType: z.enum(FORM_FIELD_VALUE_TYPES),
    required: z.boolean(),
    multiple: z.boolean(),
    options: z.array(z.object({ id: z.string(), label: z.string() }).strict()),
  })
  .strict();
export type FormFieldOption = z.infer<typeof FormFieldOptionSchema>;

export const FormPeopleListOptionSchema = z
  .object({
    typeId: z.uuid(),
    label: z.string(),
    relationships: z.array(z.object({ id: z.uuid(), sourceLabel: z.string(), targetLabel: z.string() }).strict()),
    nameFields: z.array(z.object({ fieldId: z.uuid(), label: z.string(), primary: z.boolean() }).strict()),
  })
  .strict();
export type FormPeopleListOption = z.infer<typeof FormPeopleListOptionSchema>;

export const GetPublicFormEditorSchema = z.object({ typeId: z.uuid() }).strict();
export type GetPublicFormEditorData = z.infer<typeof GetPublicFormEditorSchema>;

export const PublicFormEditorSchema = z
  .object({
    typeLabel: z.string(),
    form: PublicFormDtoSchema.nullable(),
    fields: z.array(FormFieldOptionSchema),
    peopleLists: z.array(FormPeopleListOptionSchema),
    allowed: z.boolean(),
    reason: z.enum(["workspaceDisabled", "permissionDenied"]).nullable(),
  })
  .strict();
export type PublicFormEditor = z.infer<typeof PublicFormEditorSchema>;

export type PublicFormView = {
  title: string;
  description: string | null;
  submitLabel: string;
  workspaceName: string | null;
  locale: string | null;
  fields: Array<{
    fieldId: string;
    label: string;
    helpText: string | null;
    required: boolean;
    valueType: (typeof FORM_FIELD_VALUE_TYPES)[number];
    multiple: boolean;
    options: Array<{ id: string; label: string }>;
    currency: string | null;
  }>;
  person: { emailLabel: string; nameLabel: string | null } | null;
  consent: PublicFormConsent | null;
  badge: boolean;
  renderToken: string;
};

export type PublicFormReadResult =
  | { status: "available"; form: PublicFormView }
  | { status: "unavailable" }
  | { status: "rateLimited"; retryAfterSeconds: number };

export const PUBLIC_FORM_FIELD_ERRORS = ["required", "invalid", "consent", "email"] as const;
export type PublicFormFieldError = (typeof PUBLIC_FORM_FIELD_ERRORS)[number];

export const SubmitPublicFormSchema = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/u),
    renderToken: z.string().max(200),
    website: z.string().max(200).optional(),
    locale: z.string().max(12).optional(),
    consent: z.boolean().optional(),
    email: z.string().max(320).optional(),
    name: z.string().max(200).optional(),
    answers: z.record(z.uuid(), z.union([z.string(), z.array(z.string()).max(100), z.boolean()])),
  })
  .strict();
export type SubmitPublicFormInput = z.input<typeof SubmitPublicFormSchema>;

export type PublicFormSubmitResult =
  | { status: "submitted"; message: string; redirectUrl: string | null }
  | { status: "invalid"; errors: Record<string, PublicFormFieldError> }
  | { status: "unavailable" }
  | { status: "rateLimited"; retryAfterSeconds: number };
