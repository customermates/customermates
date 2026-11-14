import { structuredOperation } from "@/core/openapi/structured-operation";

import {
  DisablePublicFormSchema,
  GetPublicFormEditorSchema,
  GetPublicFormSchema,
  ListPublicFormsSchema,
  PublicFormDtoSchema,
  PublicFormEditorSchema,
  PublicFormListResultSchema,
  UpsertPublicFormSchema,
} from "./public-form.schema";

const TYPE_ID = "0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e";
const FIELD_ID = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const FORM_ID = "4f3e2d1c-0b9a-4876-9543-210fedcba987";

const REQUIRES =
  "the publicLinks create permission, create access to the list, and public links allowed in the workspace settings to turn a form on.";

const exampleConfig = {
  title: "Contact us",
  description: "We answer within one working day.",
  submitLabel: "Send",
  fields: [{ fieldId: FIELD_ID, label: "Your message", helpText: null, required: true }],
  person: null,
  consent: { text: "I agree that you store my message.", privacyUrl: "https://example.com/privacy" },
  success: { message: "Thank you. We received your message.", redirectUrl: null },
  locale: null,
};

export const publicFormApiPaths = {
  "/v1/forms/list": {
    post: structuredOperation({
      operationId: "listForms",
      summary: "List public forms",
      description:
        "Lists the public forms of the workspace, or the form of one list. Each form carries its public url, an embedSnippet (an iframe), its definition, its submission count and this month's usage against the plan's monthly limit.",
      requires: REQUIRES,
      tag: "forms",
      input: ListPublicFormsSchema,
      output: PublicFormListResultSchema,
      outputDescription: "The forms.",
      example: { typeId: TYPE_ID },
    }),
  },
  "/v1/forms/read": {
    post: structuredOperation({
      operationId: "readForm",
      summary: "Read a public form",
      description:
        "Returns one public form with its public url, embed snippet, definition and usage. An id that does not exist answers 404.",
      requires: REQUIRES,
      tag: "forms",
      input: GetPublicFormSchema,
      output: PublicFormDtoSchema,
      outputDescription: "The form.",
      example: { id: FORM_ID },
    }),
  },
  "/v1/forms/fields": {
    post: structuredOperation({
      operationId: "listFormFields",
      summary: "List the fields a form can use",
      description:
        "Returns the fields of a list that a public form can ask for (input fields of type text, formatted text, number, currency, yes/no, date, single or multiple choice, link and contact details), the people lists a form can link a person from, and the list's current form if there is one. Read it before saving a form definition.",
      requires: REQUIRES,
      tag: "forms",
      input: GetPublicFormEditorSchema,
      output: PublicFormEditorSchema,
      outputDescription: "The usable fields, the people lists and the current form.",
      example: { typeId: TYPE_ID },
    }),
  },
  "/v1/forms/save": {
    post: structuredOperation({
      operationId: "saveForm",
      summary: "Create or update a public form",
      description:
        "Creates the form of a list (typeId, name and config are required) or, with id, updates it; config replaces the stored definition. A list has at most one form. Submissions create a record in the list with the form as its source, as the member who last turned the form on. A submission can find or create a person by email and link it; one person exists per email. When the consent text or the privacy link changes, the consent version increases. Free plan forms accept a monthly number of submissions and show a badge.",
      requires: REQUIRES,
      tag: "forms",
      input: UpsertPublicFormSchema,
      output: PublicFormDtoSchema,
      outputDescription: "The saved form with its public link.",
      example: { typeId: TYPE_ID, name: "Contact form", enabled: true, config: exampleConfig },
    }),
  },
  "/v1/forms/disable": {
    post: structuredOperation({
      operationId: "disableForm",
      summary: "Turn a public form off",
      description:
        "Turns the form off at once; its link answers as unavailable. Saving the form again with enabled true turns it back on at the same link.",
      requires: "the publicLinks create permission.",
      tag: "forms",
      input: DisablePublicFormSchema,
      output: PublicFormDtoSchema,
      outputDescription: "The form, turned off.",
      example: { id: FORM_ID },
    }),
  },
};
