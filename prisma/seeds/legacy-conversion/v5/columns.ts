import type { LegacyModel, LegacyType } from "../v2/legacy-model";
import { LEGACY_RELATIONSHIPS, LEGACY_TYPES } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import type { RecordModel } from "./contract/record-model.schema";
import { relationshipColumnKey, relationshipPathColumnKey } from "./contract/record-column.schema";

export const LIST_SURFACES = Object.fromEntries(LEGACY_TYPES.map((kind) => [`${kind}s-card-store`, kind])) as Record<
  string,
  LegacyType
>;
export const DETAIL_SURFACES = Object.fromEntries(LEGACY_TYPES.map((kind) => [`${kind}-detail`, kind])) as Record<
  string,
  LegacyType
>;

export class PresentationMigrationError extends Error {
  constructor(
    readonly field: string,
    readonly code: string,
  ) {
    super(`${code}: ${field}`);
  }
}

export function migrateColumnKey(source: LegacyModel, kind: LegacyType, key: string): string {
  const id = (name: string) => presetId(source.companyId, name);
  if (key === "createdAt" || key === "updatedAt") return `system:${key}`;
  if (key === "users" || key === "userIds") return "system:assignedTo";
  if (kind === "contact" && (key === "channels" || key === "identifiers")) return "system:channels";
  const field = source.model.fields.find(
    (field) => field.typeId === id(kind) && (field.id === key || field.id === id(`${kind}.${key}`)),
  );
  if (field) return field.id;
  const target = LEGACY_TYPES.find((type) => key === `${type}s` || key === `${type}Ids`);
  if (target) {
    if ((kind === "deal" && target === "service") || (kind === "service" && target === "deal"))
      return relationshipPathColumnKey(id(`${kind}.${target}s.path`));
    const relation = LEGACY_RELATIONSHIPS.find(
      (relation) =>
        (relation.source === kind && relation.target === target) ||
        (relation.target === kind && relation.source === target),
    );
    if (relation) return relationshipColumnKey(id(relation.key), relation.source === kind ? "outgoing" : "incoming");
  }
  throw new PresentationMigrationError(key, "unresolved_presentation_field");
}

const LEGACY_COLUMNS: Record<LegacyType, string[]> = {
  contact: ["name", "channels", "organizations", "deals", "tasks"],
  organization: ["name", "contacts", "deals", "tasks"],
  deal: ["name", "totalValue", "weightedValue", "totalQuantity", "contacts", "organizations", "services", "tasks"],
  service: ["name", "amount", "deals", "tasks"],
  task: ["name", "contacts", "organizations", "deals", "services"],
};

export function presentationTypeDefaults(
  source: LegacyModel,
  kind: LegacyType,
): RecordModel["types"][number]["defaults"] {
  return {
    columns: [
      ...LEGACY_COLUMNS[kind].map((key) => migrateColumnKey(source, kind, key)),
      ...source.columns.filter((column) => column.entityType === kind).map((column) => column.id),
      "system:assignedTo",
      "system:updatedAt",
      "system:createdAt",
    ],
    hiddenColumns: introducedPresentationColumns(source.companyId, kind),
    layout: "table",
    groupBy: null,
    sortField: null,
    sortDirection: "asc",
    pinnedFields: [],
    ...(kind === "deal"
      ? {
          groupSummaries: [
            { fieldId: presetId(source.companyId, "deal.totalValue"), aggregation: "sum" as const },
            { fieldId: presetId(source.companyId, "deal.weightedValue"), aggregation: "sum" as const },
          ],
        }
      : {}),
  };
}

export function introducedPresentationColumns(companyId: string, kind: LegacyType): string[] {
  if (kind === "contact")
    return ["firstName", "lastName", "avatarUrl"].map((key) => presetId(companyId, `contact.${key}`));
  if (kind === "deal" || kind === "service")
    return [relationshipColumnKey(presetId(companyId, `lineItem.${kind}`), "incoming")];
  return [];
}
