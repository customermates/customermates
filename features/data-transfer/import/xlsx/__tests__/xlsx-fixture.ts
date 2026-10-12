import type { RecordField, RecordModelView } from "@/features/records/record-model.schema";

export const PROJECT = "10000000-0000-4000-8000-000000000001";
export const COMPANY = "10000000-0000-4000-8000-000000000002";
export const PROJECT_COMPANY = "10000000-0000-4000-8000-000000000003";

let sequence = 100;

function uuid() {
  sequence += 1;
  return `20000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
}

function field(label: string, valueType: RecordField["valueType"], extra: Partial<RecordField> = {}): RecordField {
  return {
    id: uuid(),
    typeId: PROJECT,
    label,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: sequence,
    ...extra,
  };
}

export const fields = {
  name: field("Name", "text", { required: true }),
  notes: field("Notes", "richText"),
  budget: field("Budget", "currency", { format: { currency: "EUR" } }),
  hours: field("Hours", "number"),
  start: field("Start date", "date"),
  kickoff: field("Kickoff", "dateTime"),
  period: field("Period", "dateRange"),
  active: field("Active", "boolean"),
  email: field("Email", "email"),
  website: field("Website", "url"),
  phone: field("Phone", "phone"),
  status: field("Status", "select", {
    options: [
      { id: "open", label: "Open", color: null, attributes: [] },
      { id: "in-progress", label: "In Bearbeitung", color: null, attributes: [] },
    ],
  }),
  tags: field("Tags", "select", {
    multiple: true,
    options: [
      { id: "a", label: "Alpha", color: null, attributes: [] },
      { id: "b", label: "Beta", color: null, attributes: [] },
    ],
  }),
  lead: field("Lead", "member"),
  score: field("Score", "number", { behavior: { kind: "formula", expression: { kind: "literal", value: null } } }),
  priority: field("Priority", "select", {
    behavior: { kind: "input", defaultValue: { kind: "select", value: "normal" } },
    options: [{ id: "normal", label: "Normal", color: null, attributes: [] }],
  }),
};

export const companyName: RecordField = {
  ...field("Name", "text", { required: true }),
  typeId: COMPANY,
};

export const model: RecordModelView = {
  revision: 7,
  types: [
    {
      id: PROJECT,
      label: "Project",
      pluralLabel: "Projects",
      description: "",
      icon: "list",
      primaryFieldId: fields.name.id,
      parentRelationshipId: null,
      embedded: false,
      navigationVisible: true,
      archived: false,
      position: 0,
    },
    {
      id: COMPANY,
      label: "Company",
      pluralLabel: "Companies",
      description: "",
      icon: "building",
      primaryFieldId: companyName.id,
      parentRelationshipId: null,
      embedded: false,
      navigationVisible: true,
      archived: false,
      position: 1,
    },
  ],
  fields: [...Object.values(fields), companyName],
  relationships: [
    {
      id: PROJECT_COMPANY,
      sourceTypeId: PROJECT,
      targetTypeId: COMPANY,
      sourceLabel: "Companies",
      targetLabel: "Projects",
      sourceCardinality: "many",
      targetCardinality: "many",
      onSourceDelete: "unlink",
      onTargetDelete: "unlink",
      messagesOnSource: false,
      messagesOnTarget: false,
      archived: false,
    },
  ],
  accessPresets: [],
  capabilities: [],
};

export const labels = { recordId: "Record ID", assignedTo: "Assigned to" };
