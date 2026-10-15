import type { RecordModel } from "@/features/records/record-model.schema";
import type { SetupPlan } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult, SetupResolver } from "./setup-references";

import { importableSpreadsheetField } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";

export type SetupImportMapping = { typeId: string; columns: Array<{ column: string; fieldId: string | null }> };

export function compileSetupImportMapping(
  plan: SetupPlan,
  resolver: SetupResolver,
  model: RecordModel,
): SetupCompileResult<SetupImportMapping | null> {
  const mapping = plan.importMapping;
  if (!mapping) return { ok: true, data: null };
  const issues: SetupCompileIssue[] = [];
  const typeId = resolver.list(mapping.list);
  if (!typeId) return { ok: false, issues: [{ code: "unknown_list", path: "importMapping.list" }] };
  const targets = new Set<string>();
  const columns = mapping.columns.map(({ column, field }, index) => {
    if (!field) return { column, fieldId: null };
    const path = `importMapping.columns.${index}.field`;
    const definition = model.fields.find((candidate) => candidate.id === resolver.field(field));
    if (!definition || definition.typeId !== typeId) issues.push({ code: "unknown_field", path });
    else if (!importableSpreadsheetField(definition)) issues.push({ code: "field_not_importable", path });
    else if (targets.has(definition.id)) issues.push({ code: "field_mapped_twice", path });
    else targets.add(definition.id);
    return { column, fieldId: definition?.id ?? null };
  });
  return issues.length ? { ok: false, issues } : { ok: true, data: { typeId, columns } };
}
