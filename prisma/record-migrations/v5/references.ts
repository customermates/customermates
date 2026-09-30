import type { ClientBase } from "pg";
import type { MigrationIssue } from "../v2/legacy-model";
import { LEGACY_TABLES, LEGACY_TYPES } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import type { RecordModel } from "./contract/record-model.schema";
import type { RecordQuery } from "./contract/record-query.schema";

type Scope = Pick<RecordQuery, "typeId" | "filters" | "relationships" | "relatedFilters">;

export async function validatePresentationReferences(
  client: ClientBase,
  companyId: string,
  model: RecordModel,
  scopes: Scope[],
  owner: { table: string; id: string },
): Promise<MigrationIssue[]> {
  const wanted = new Map<string, Set<string>>();
  const add = (scope: string, values: string[]) => {
    const ids = wanted.get(scope) ?? new Set<string>();
    for (const value of values) ids.add(value);
    wanted.set(scope, ids);
  };
  const endpoint = (typeId: string, step: Scope["relationships"][number]) => {
    const relation = model.relationships.find((relation) => relation.id === step.relationId);
    if (!relation || (step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
      throw new Error("Cannot inspect an invalid presentation relationship");
    return step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
  };
  const inspect = (scope: Scope) => {
    for (const filter of scope.filters) {
      const values = filter.values ?? (filter.value ? [filter.value] : []);
      add(
        "member",
        values.flatMap((value) => (value.kind === "member" ? [value.value] : [])),
      );
    }
    for (const filter of scope.relationships) add(endpoint(scope.typeId, filter), filter.recordIds ?? []);
    for (const related of scope.relatedFilters ?? []) {
      let typeId = scope.typeId;
      for (const step of related.path) typeId = endpoint(typeId, { ...step, operator: "any", recordIds: null });
      add(typeId, related.recordIds ?? []);
      inspect({ typeId, filters: related.filters, relationships: related.relationships });
    }
  };
  scopes.forEach(inspect);
  const issues: MigrationIssue[] = [];
  for (const [scope, ids] of wanted) {
    if (!ids.size) continue;
    const legacy = LEGACY_TYPES.find((kind) => presetId(companyId, kind) === scope);
    const table =
      scope === "member"
        ? "User"
        : legacy
          ? LEGACY_TABLES[legacy]
          : scope === presetId(companyId, "lineItem")
            ? "ServiceDeal"
            : null;
    if (!table) throw new Error("Unmapped presentation reference type");
    const missing = await client.query<{ id: string }>(
      `SELECT wanted.id FROM unnest($2::text[]) wanted(id) WHERE NOT EXISTS (SELECT 1 FROM "${table}" record WHERE record."companyId" = $1 AND record.id = wanted.id)`,
      [companyId, [...ids]],
    );
    for (const row of missing.rows)
      issues.push({ ...owner, field: `${scope}:${row.id}`, code: "unresolved_presentation_reference" });
  }
  return issues;
}
