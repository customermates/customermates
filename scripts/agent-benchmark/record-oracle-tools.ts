import { presetId } from "@/features/records/crm-preset";
import { LEGACY_RELATIONSHIPS } from "@/prisma/seeds/legacy-conversion/v2/legacy-model";

type Row = Record<string, unknown>;
type Snapshot = Record<string, unknown[]>;
type Tool = { name: string; input?: unknown; outcome?: string };
const KINDS = ["contact", "organization", "deal", "service", "task", "lineItem"] as const;
export const CURRENT_RECORD_READ_TOOLS = ["discover_record_types", "get_record_model", "query_crm_records", "query_crm_measure", "read_crm_record", "search_crm_records", "read_crm_operation", "preview_crm_deletion"];

export type RecordKind = (typeof KINDS)[number];
const inputOf = (tool: Tool) => (tool.input ?? {}) as Row;
const mutationOf = (tool: Tool) => (tool.name === "mutate_crm_record" ? ((inputOf(tool).mutation ?? {}) as Row) : null);

export function recordKind(typeId: unknown, companyId: string): RecordKind | undefined {
  return KINDS.find((kind) => presetId(companyId, kind) === typeId);
}

export type RecordQueryRead = { kind?: RecordKind; page: number; grouped: boolean; filterFieldIds: string[]; measure: boolean };

export function recordQuery(tool: Tool, companyId: string): RecordQueryRead | null {
  if (tool.name !== "query_crm_records" && tool.name !== "query_crm_measure") return null;
  const input = inputOf(tool);
  const query = (input.source ?? input) as Row;
  const filters = (Array.isArray(query.filters) ? query.filters : []) as Row[];
  return {
    kind: recordKind(query.typeId, companyId),
    page: Number(input.page ?? 1),
    grouped: input.groupBy !== undefined || input.grouping !== undefined,
    filterFieldIds: filters.map((filter) => String(filter.fieldId)),
    measure: tool.name === "query_crm_measure",
  };
}

export function readRecordKind(tool: Tool, companyId: string): RecordKind | undefined {
  return tool.name === "read_crm_record" ? recordKind(inputOf(tool).typeId, companyId) : undefined;
}

export function readRecordIds(tools: readonly Tool[]): Set<string> {
  return new Set(tools.filter((tool) => tool.name === "read_crm_record" && tool.outcome === "ok").map((tool) => String(inputOf(tool).recordId)));
}

export function readsRecordFields(tool: Tool, kind: RecordKind, companyId: string, viaAnalysis: boolean): boolean {
  const query = recordQuery(tool, companyId);
  if (!query || query.kind !== kind || tool.outcome !== "ok" || query.grouped) return false;
  const input = inputOf(tool);
  if (!query.measure) return !Array.isArray(input.fields) || input.fields.length > 0;
  return viaAnalysis;
}

export type RecordMutationKind = "create" | "update" | "notes" | "delete" | "link";

export function recordMutation(tool: Tool, companyId: string): { kind: RecordMutationKind; type?: RecordKind; recordIds: string[] } | null {
  const mutation = mutationOf(tool);
  if (!mutation) return null;
  const ref = mutation.ref as Row | undefined;
  const type = recordKind(mutation.typeId ?? ref?.typeId, companyId);
  const recordIds = ref?.recordId === undefined ? [] : [String(ref.recordId)];
  if (mutation.action === "delete") return { kind: "delete", type, recordIds };
  if (mutation.action === "link" || mutation.action === "unlink") return { kind: "link", type, recordIds };
  if (mutation.action === "create") return { kind: "create", type, recordIds };
  if (mutation.action !== "update") return null;
  const fields = (mutation.fields ?? []) as Row[];
  const notesOnly = type !== undefined && fields.length > 0 && fields.every((field) => field.fieldId === presetId(companyId, `${type}.notes`));
  return { kind: notesOnly ? "notes" : "update", type, recordIds };
}

export const isRecordMutation = (tool: Tool, companyId: string, kinds: readonly RecordMutationKind[], type?: RecordKind) => {
  const mutation = recordMutation(tool, companyId);
  return mutation !== null && kinds.includes(mutation.kind) && (type === undefined || mutation.type === type);
};

export const appliesRecordSchema = (tool: Tool) => tool.name === "configure_record_model" && inputOf(tool).action === "apply";

/** Exclude only the physical rows represented by explicitly permitted logical changes. */
export function withoutRecordState(snapshot: Snapshot, omitted: readonly string[]): Snapshot {
  const values = (table: string) => (snapshot[table] ?? []) as Row[];
  const companyId = String(values("generic:recordSchemaState")[0]?.companyId ?? "");
  const typeIds = new Set(KINDS.filter((kind) => omitted.includes(kind) || (kind === "lineItem" && omitted.includes("serviceDeal"))).map((kind) => presetId(companyId, kind)));
  const assignmentTypes = new Set(KINDS.filter((kind) => omitted.includes(`${kind}User`)).map((kind) => presetId(companyId, kind)));
  const relationIds = new Set(LEGACY_RELATIONSHIPS.filter((relation) => omitted.includes(relation.table[0].toLowerCase() + relation.table.slice(1))).map((relation) => presetId(companyId, relation.key)));
  if (omitted.includes("serviceDeal")) for (const endpoint of ["deal", "service"]) relationIds.add(presetId(companyId, `lineItem.${endpoint}`));
  const customFields = new Set(values("customColumn").map((field) => field.id));
  const customValues = omitted.includes("customFieldValue");
  const schemaFields = omitted.includes("customColumn");
  const customTypes = new Set(values("customColumn").map((field) => presetId(companyId, String(field.entityType))));
  const strip = (row: Row, keys: readonly string[]) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
  return Object.fromEntries(Object.entries(snapshot).filter(([table]) => !omitted.includes(table) && !(schemaFields && table === "generic:recordSchemaRevision")).map(([table, records]) => {
    if (table === "generic:crmRecord") return [table, (records as Row[]).filter((row) => !typeIds.has(String(row.typeId))).map((row) => assignmentTypes.has(String(row.typeId)) || (customValues && customTypes.has(String(row.typeId))) ? strip(row, ["version"]) : row)];
    if (table === "generic:recordValue" || table === "generic:recordValueDependency") return [table, (records as Row[]).filter((row) => !typeIds.has(String(row.typeId)) && !(customValues && customFields.has(row.fieldId))).map((row) => schemaFields ? strip(row, ["schemaRevision"]) : row)];
    if (table === "generic:recordAssignment") return [table, (records as Row[]).filter((row) => !assignmentTypes.has(String(row.typeId)))];
    if (table === "generic:recordLink") return [table, (records as Row[]).filter((row) => !relationIds.has(String(row.relationId)))];
    if (table === "generic:recordFieldDefinition" && schemaFields) return [table, (records as Row[]).filter((row) => !customFields.has(row.id))];
    if (table === "generic:recordSchemaState" && schemaFields) return [table, (records as Row[]).map((row) => strip(row, ["revision"]))];
    if (table === "generic:model" && schemaFields) return [table, (records as Row[]).map((row) => ({ ...strip(row, ["revision"]), fields: (row.fields as Row[]).filter((field) => !customFields.has(field.id)) }))];
    return [table, records];
  }));
}
