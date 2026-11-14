import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { PublicFormConfig } from "../public-form.schema";

export const COMPANY_ID = "00000000-0000-4000-8000-0000000000c1";
export const USER_ID = "00000000-0000-4000-8000-0000000000a1";
export const FORM_ID = "00000000-0000-4000-8000-0000000000f1";
export const TYPE_ID = "00000000-0000-4000-8000-0000000000b1";
export const PEOPLE_TYPE_ID = "00000000-0000-4000-8000-0000000000b2";
export const RELATION_ID = "00000000-0000-4000-8000-0000000000d1";
export const NAME_FIELD = "00000000-0000-4000-8000-0000000000e1";
export const NOTES_FIELD = "00000000-0000-4000-8000-0000000000e2";
export const SOURCE_FIELD = "00000000-0000-4000-8000-0000000000e3";
export const AGREE_FIELD = "00000000-0000-4000-8000-0000000000e4";
export const SIZE_FIELD = "00000000-0000-4000-8000-0000000000e5";
export const CONTACT_FIELD = "00000000-0000-4000-8000-0000000000e6";
export const FORMULA_FIELD = "00000000-0000-4000-8000-0000000000e7";
export const PERSON_NAME_FIELD = "00000000-0000-4000-8000-0000000000e8";
export const PERSON_CONTACT_FIELD = "00000000-0000-4000-8000-0000000000e9";
export const SECRET = "form-test-secret-0123456789";

function field(overrides: Partial<RecordField> & Pick<RecordField, "id" | "valueType" | "label">): RecordField {
  return {
    typeId: TYPE_ID,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
    ...overrides,
  } as RecordField;
}

export function createModel(overrides: Partial<RecordModel> = {}): RecordModel {
  return {
    revision: 3,
    types: [
      {
        id: TYPE_ID,
        label: "Lead",
        pluralLabel: "Leads",
        archived: false,
        embedded: false,
        primaryFieldId: NAME_FIELD,
      },
      {
        id: PEOPLE_TYPE_ID,
        label: "Person",
        pluralLabel: "People",
        archived: false,
        embedded: false,
        primaryFieldId: PERSON_NAME_FIELD,
      },
    ],
    fields: [
      field({ id: NAME_FIELD, valueType: "text", label: "Name", required: true, position: 0 }),
      field({ id: NOTES_FIELD, valueType: "richText", label: "Notes", position: 1 }),
      field({
        id: SOURCE_FIELD,
        valueType: "select",
        label: "Source",
        position: 2,
        options: [
          { id: "web", label: "Website", color: null, attributes: [] },
          { id: "event", label: "Event", color: null, attributes: [] },
        ],
      }),
      field({ id: AGREE_FIELD, valueType: "boolean", label: "Agreed", position: 3 }),
      field({ id: SIZE_FIELD, valueType: "number", label: "Team size", position: 4 }),
      field({ id: CONTACT_FIELD, valueType: "channels", label: "Contact details", position: 5 }),
      field({
        id: FORMULA_FIELD,
        valueType: "text",
        label: "Calculated",
        position: 6,
        behavior: { kind: "formula", expression: { kind: "literal", value: null } },
      }),
      field({ id: PERSON_NAME_FIELD, typeId: PEOPLE_TYPE_ID, valueType: "text", label: "Full name", position: 0 }),
      field({
        id: PERSON_CONTACT_FIELD,
        typeId: PEOPLE_TYPE_ID,
        valueType: "channels",
        label: "Contact details",
        position: 1,
      }),
    ],
    relationships: [
      {
        id: RELATION_ID,
        sourceTypeId: TYPE_ID,
        targetTypeId: PEOPLE_TYPE_ID,
        sourceLabel: "Leads",
        targetLabel: "Person",
        sourceCardinality: "many",
        targetCardinality: "one",
        onSourceDelete: "unlink",
        onTargetDelete: "unlink",
        messagesOnSource: false,
        messagesOnTarget: false,
        archived: false,
      },
    ],
    accessPresets: [],
    capabilities: [],
    ...overrides,
  } as unknown as RecordModel;
}

export function failureCodeOf(result: { ok: boolean; error?: { issues: ReadonlyArray<unknown> } }): string | undefined {
  return (result.error?.issues[0] as { params?: { error?: string } } | undefined)?.params?.error;
}

export function createConfig(overrides: Partial<PublicFormConfig> = {}): PublicFormConfig {
  return {
    title: "Contact us",
    description: null,
    submitLabel: "Send",
    fields: [
      { fieldId: NAME_FIELD, label: "Your name", helpText: null, required: true },
      { fieldId: NOTES_FIELD, label: "Message", helpText: "Anything we should know", required: false },
      { fieldId: SOURCE_FIELD, label: "How did you hear of us?", helpText: null, required: false },
    ],
    person: null,
    consent: { text: "I agree that you store my message.", privacyUrl: "https://example.com/privacy" },
    success: { message: "Thank you. We received your message.", redirectUrl: null },
    locale: null,
    ...overrides,
  };
}
