import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordSurfaceKey } from "@/core/data-view/data-view-keys";
import type { AgentDataViewState } from "@/features/data-view/manage-data-views.schema";
import type { SetupPlan } from "./setup-plan.schema";
import type { SetupCompileIssue, SetupCompileResult, SetupResolver } from "./setup-references";

import { ViewMode } from "@/core/base/base-query-builder";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { AgentDataViewStateSchema } from "@/features/data-view/manage-data-views.schema";
import { recordColumns } from "@/features/records/record-columns";
import { recordViewStateIsValid } from "@/features/records/record-view-state";

export type SetupViewDraft = {
  action: "create";
  surfaceKey: RecordSurfaceKey;
  name: string;
  state: AgentDataViewState;
};

export function compileSetupListDefaults(
  plan: SetupPlan,
  resolver: SetupResolver,
  model: RecordModel,
): SetupCompileResult<SetupViewDraft[]> {
  const issues: SetupCompileIssue[] = [];
  const views: SetupViewDraft[] = [];
  plan.listDefaults.forEach((value, index) => {
    const path = `listDefaults.${index}`;
    const typeId = resolver.list(value.list);
    if (!typeId) {
      issues.push({ code: "unknown_list", path: `${path}.list` });
      return;
    }
    const field = (ref: string, at: string) => {
      const id = resolver.field(ref);
      if (!id) issues.push({ code: "unknown_field", path: at });
      return id;
    };
    const primary = model.types.find((type) => type.id === typeId)?.primaryFieldId;
    const columns = [
      ...new Set([
        ...(primary ? [primary] : []),
        ...value.columns.flatMap((column, position) => field(column, `${path}.columns.${position}`) ?? []),
      ]),
    ];
    const groupBy = value.groupBy ? field(value.groupBy, `${path}.groupBy`) : null;
    const sortField = value.sort ? field(value.sort.field, `${path}.sort.field`) : null;
    const summaries = value.summaries.flatMap((summary, position) => {
      const fieldId = field(summary.field, `${path}.summaries.${position}.field`);
      return fieldId ? [{ fieldId, aggregation: summary.aggregation }] : [];
    });
    if (issues.length) return;
    const state: AgentDataViewState = {
      viewMode: value.layout === "board" ? ViewMode.card : ViewMode.table,
      grouping: groupBy ? { field: groupBy, ...(summaries.length ? { summaries } : {}) } : null,
      sortDescriptor: value.sort && sortField ? { field: sortField, direction: value.sort.direction } : null,
      ...(value.columns.length
        ? {
            columnOrder: columns,
            hiddenColumns: recordColumns(typeId, model)
              .map((column) => column.id)
              .filter((id) => !columns.includes(id)),
          }
        : {}),
    };
    const parsed = AgentDataViewStateSchema.safeParse(state);
    if (!parsed.success || !recordViewStateIsValid(typeId, parsed.data, model)) {
      issues.push({ code: "invalid_view", path });
      return;
    }
    views.push({ action: "create", surfaceKey: recordSurfaceKey(typeId), name: value.name, state: parsed.data });
  });
  return issues.length ? { ok: false, issues } : { ok: true, data: views };
}
