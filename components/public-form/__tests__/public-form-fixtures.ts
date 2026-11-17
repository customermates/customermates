import type { AutomationRuleDto } from "@/features/automation-rules/automation-rule.schema";
import type { PublicFormEditor } from "@/features/public-form/public-form.schema";
import type { DraftTexts } from "../public-form-draft";

export const TYPE_ID = "40000000-0000-4000-8000-000000000001";
export const FORM_ID = "50000000-0000-4000-8000-000000000001";
export const NAME_FIELD = "60000000-0000-4000-8000-000000000001";
export const NOTE_FIELD = "60000000-0000-4000-8000-000000000002";
export const COMPANY_FIELD = "60000000-0000-4000-8000-000000000003";
export const PEOPLE_TYPE = "40000000-0000-4000-8000-000000000002";
export const RELATIONSHIP = "70000000-0000-4000-8000-000000000001";
export const PEOPLE_NAME_FIELD = "60000000-0000-4000-8000-000000000004";

export const TEXTS: DraftTexts = {
  submitLabel: "Send",
  successMessage: "Thank you. We received your message.",
  emailLabel: "Email",
  nameLabel: "Name",
};

export function editor(overrides: Partial<PublicFormEditor> = {}): PublicFormEditor {
  return {
    typeLabel: "Leads",
    form: null,
    fields: [
      {
        fieldId: NAME_FIELD,
        label: "Name",
        valueType: "text",
        required: true,
        mustInclude: true,
        multiple: false,
        options: [],
      },
      {
        fieldId: NOTE_FIELD,
        label: "Note",
        valueType: "text",
        required: false,
        mustInclude: false,
        multiple: false,
        options: [],
      },
      {
        fieldId: COMPANY_FIELD,
        label: "Company",
        valueType: "text",
        required: false,
        mustInclude: false,
        multiple: false,
        options: [],
      },
    ],
    peopleLists: [
      {
        typeId: PEOPLE_TYPE,
        label: "People",
        relationships: [{ id: RELATIONSHIP, sourceLabel: "Leads", targetLabel: "People" }],
        nameFields: [{ fieldId: PEOPLE_NAME_FIELD, label: "Name", primary: true }],
      },
    ],
    blockingFields: [],
    failures: { count: 0, lastAt: null },
    workspaceName: "Acme",
    badge: false,
    allowed: true,
    reason: null,
    ...overrides,
  };
}

export function savedForm(
  overrides: Partial<NonNullable<PublicFormEditor["form"]>> = {},
): NonNullable<PublicFormEditor["form"]> {
  return {
    id: FORM_ID,
    typeId: TYPE_ID,
    name: "Leads",
    enabled: true,
    url: `https://app.example.com/f/${"a".repeat(64)}`,
    embedSnippet: "<iframe></iframe>",
    config: {
      title: "Contact us",
      description: null,
      submitLabel: "Send",
      fields: [
        { fieldId: NOTE_FIELD, label: "Note", helpText: null, required: false },
        { fieldId: NAME_FIELD, label: "Name", helpText: "Your full name", required: true },
      ],
      person: null,
      consent: null,
      success: { message: "Thanks", redirectUrl: null },
      locale: null,
    },
    consentVersion: 1,
    submissionCount: 0,
    lastSubmittedAt: null,
    createdAt: "2026-11-12T10:00:00.000Z",
    updatedAt: "2026-11-12T10:00:00.000Z",
    usage: { submissionsThisMonth: 0, monthlyLimit: null, badge: false },
    ...overrides,
  };
}

export function rule(overrides: Partial<AutomationRuleDto> = {}): AutomationRuleDto {
  return {
    id: "80000000-0000-4000-8000-000000000001",
    ownerUserId: "90000000-0000-4000-8000-000000000001",
    owner: {
      id: "90000000-0000-4000-8000-000000000001",
      firstName: "Test",
      lastName: "User",
      avatarUrl: null,
      status: "active",
    },
    name: "Tell me about new leads",
    enabled: true,
    trigger: { kind: "formSubmitted", typeId: TYPE_ID },
    conditions: [],
    effects: [
      {
        kind: "notify",
        recipients: { ruleOwner: true, assignees: false, userIds: [] },
        notificationKind: "ruleAlert",
        title: "New lead",
      },
    ],
    disabledReason: null,
    lastRunAt: null,
    lastRunStatus: null,
    createdAt: "2026-11-12T10:00:00.000Z",
    updatedAt: "2026-11-12T10:00:00.000Z",
    ...overrides,
  };
}
