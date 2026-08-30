import { EntityType } from "@/generated/prisma";

export type ImportFieldKind = "text" | "number" | "notes" | "relationIds" | "dealServices";

export type RelationTarget = "contact" | "organization" | "deal" | "service" | "task" | "user";

export type ImportFieldDescriptor = {
  key: string;
  labelKey: string;
  kind: ImportFieldKind;
  requiredOnCreate: boolean;
  relationTarget?: RelationTarget;
};

export type ImportEntityDescriptor = {
  entityType: EntityType;
  collectionKey: string;
  supportsIdentifiers: boolean;
  fields: ImportFieldDescriptor[];
};

const NAME_FIELD: ImportFieldDescriptor = {
  key: "name",
  labelKey: "Common.table.columns.name",
  kind: "text",
  requiredOnCreate: true,
};

const NOTES_FIELD: ImportFieldDescriptor = {
  key: "notes",
  labelKey: "Common.table.columns.notes",
  kind: "notes",
  requiredOnCreate: false,
};

function relation(key: string, target: RelationTarget, labelKey: string): ImportFieldDescriptor {
  return { key, labelKey, kind: "relationIds", requiredOnCreate: false, relationTarget: target };
}

export const IMPORT_ENTITIES: Record<EntityType, ImportEntityDescriptor> = {
  [EntityType.contact]: {
    entityType: EntityType.contact,
    collectionKey: "contacts",
    supportsIdentifiers: true,
    fields: [
      { key: "firstName", labelKey: "Common.table.columns.firstName", kind: "text", requiredOnCreate: true },
      { key: "lastName", labelKey: "Common.table.columns.lastName", kind: "text", requiredOnCreate: true },
      NOTES_FIELD,
      relation("organizationIds", "organization", "Common.table.columns.organizations"),
      relation("userIds", "user", "Common.table.columns.users"),
      relation("dealIds", "deal", "Common.table.columns.deals"),
      relation("taskIds", "task", "Common.table.columns.tasks"),
    ],
  },
  [EntityType.organization]: {
    entityType: EntityType.organization,
    collectionKey: "organizations",
    supportsIdentifiers: false,
    fields: [
      NAME_FIELD,
      NOTES_FIELD,
      relation("contactIds", "contact", "Common.table.columns.contacts"),
      relation("userIds", "user", "Common.table.columns.users"),
      relation("dealIds", "deal", "Common.table.columns.deals"),
      relation("taskIds", "task", "Common.table.columns.tasks"),
    ],
  },
  [EntityType.deal]: {
    entityType: EntityType.deal,
    collectionKey: "deals",
    supportsIdentifiers: false,
    fields: [
      NAME_FIELD,
      NOTES_FIELD,
      relation("organizationIds", "organization", "Common.table.columns.organizations"),
      relation("userIds", "user", "Common.table.columns.users"),
      relation("contactIds", "contact", "Common.table.columns.contacts"),
      { key: "services", labelKey: "Common.table.columns.services", kind: "dealServices", requiredOnCreate: false },
      relation("taskIds", "task", "Common.table.columns.tasks"),
    ],
  },
  [EntityType.service]: {
    entityType: EntityType.service,
    collectionKey: "services",
    supportsIdentifiers: false,
    fields: [
      NAME_FIELD,
      { key: "amount", labelKey: "Common.table.columns.amount", kind: "number", requiredOnCreate: true },
      NOTES_FIELD,
      relation("userIds", "user", "Common.table.columns.users"),
      relation("dealIds", "deal", "Common.table.columns.deals"),
      relation("taskIds", "task", "Common.table.columns.tasks"),
    ],
  },
  [EntityType.task]: {
    entityType: EntityType.task,
    collectionKey: "tasks",
    supportsIdentifiers: false,
    fields: [
      NAME_FIELD,
      NOTES_FIELD,
      relation("userIds", "user", "Common.table.columns.users"),
      relation("contactIds", "contact", "Common.table.columns.contacts"),
      relation("organizationIds", "organization", "Common.table.columns.organizations"),
      relation("dealIds", "deal", "Common.table.columns.deals"),
      relation("serviceIds", "service", "Common.table.columns.services"),
    ],
  },
};
