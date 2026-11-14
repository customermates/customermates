import type { IncomingWebhookMapping } from "../incoming-webhook.schema";

import {
  COMPANY_ID,
  CONTACT_FIELD,
  NAME_FIELD,
  NOTES_FIELD,
  SIZE_FIELD,
  SOURCE_FIELD,
  TYPE_ID,
  USER_ID,
  createModel,
} from "@/features/public-form/__tests__/public-form-fixtures";

export { COMPANY_ID, CONTACT_FIELD, NAME_FIELD, NOTES_FIELD, SIZE_FIELD, SOURCE_FIELD, TYPE_ID, USER_ID, createModel };

export const HOOK_ID = "00000000-0000-4000-8000-0000000000c9";
export const SECRET = "incoming-webhook-test-secret";

export function createMapping(overrides: Partial<IncomingWebhookMapping> = {}): IncomingWebhookMapping {
  return {
    mode: "create",
    matchFieldId: null,
    fields: [
      { path: "data.name", fieldId: NAME_FIELD },
      { path: "data.notes", fieldId: NOTES_FIELD },
      { path: "data.source", fieldId: SOURCE_FIELD },
      { path: "data.size", fieldId: SIZE_FIELD },
    ],
    ...overrides,
  } as IncomingWebhookMapping;
}

export const PAYLOAD = {
  data: {
    name: "Ada Lovelace",
    notes: "Hello",
    source: "Website",
    size: 12,
    tags: ["a", "b"],
    deep: { items: [{ id: 7 }] },
  },
};
