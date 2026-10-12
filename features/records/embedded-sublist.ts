import type { RecordColumn } from "./record-columns";
import type { RecordGroupSummaryResult } from "./record-grouping.schema";
import type { RecordFieldView, RecordModelView } from "./record-model.schema";
import type { RecordQueryResult } from "./record-query-result.schema";

import { parseRelationshipColumnKey, relationshipColumnKey } from "./record-column.schema";
import { defaultHiddenColumns, recordColumns } from "./record-columns";
import { RecordQuerySchema } from "./record-query.schema";

export const EMBEDDED_PAGE_SIZE = 10;

export type EmbeddedSublistPage = {
  columns: string[] | null;
  rows: RecordQueryResult;
  totals: RecordGroupSummaryResult[];
};

type Column = Pick<RecordColumn, "id" | "kind">;

export function embeddedColumnLayout({
  columns,
  primaryColumnId,
  parentColumnId,
  defaultHidden,
  chosen,
}: {
  columns: Column[];
  primaryColumnId: string;
  parentColumnId: string;
  defaultHidden: string[];
  chosen: string[] | null;
}): { columnOrder: string[]; hiddenColumns: string[] } {
  const choosable = columns.filter((column) => column.id !== primaryColumnId && column.id !== parentColumnId);
  const available = new Set(choosable.map((column) => column.id));
  const quiet = new Set(defaultHidden);
  const unhidden = choosable.filter((column) => !quiet.has(column.id));
  const own = unhidden.filter((column) => column.kind !== "system");
  const shown = chosen
    ? [...new Set(chosen)].filter((id) => available.has(id))
    : (own.length ? own : unhidden).map((column) => column.id);
  const visible = new Set(shown);
  const rest = choosable.filter((column) => !visible.has(column.id)).map((column) => column.id);
  return { columnOrder: [...shown, ...rest], hiddenColumns: [...rest, parentColumnId] };
}

export function embeddedSublistLayout(
  model: Pick<RecordModelView, "types" | "fields" | "relationships">,
  typeId: string,
  parentRelationId: string,
  chosen: string[] | null,
) {
  const columns = recordColumns<RecordFieldView>(typeId, model as RecordModelView);
  const layout = embeddedColumnLayout({
    columns,
    primaryColumnId: model.types.find((type) => type.id === typeId)?.primaryFieldId ?? "",
    parentColumnId: relationshipColumnKey(parentRelationId, "outgoing"),
    defaultHidden: defaultHiddenColumns(typeId, model.fields),
    chosen,
  });
  const hidden = new Set(layout.hiddenColumns);
  return { ...layout, shown: columns.filter((column) => !hidden.has(column.id)) };
}

export function embeddedSublistQueries({
  typeId,
  parentRelationId,
  parentRecordId,
  shown,
  page = 1,
  pageSize = EMBEDDED_PAGE_SIZE,
  sort,
}: {
  typeId: string;
  parentRelationId: string;
  parentRecordId: string;
  shown: RecordColumn<RecordFieldView>[];
  page?: number;
  pageSize?: number;
  sort?: { field: string; direction: "asc" | "desc" };
}) {
  const scope = {
    typeId,
    relationships: [
      {
        relationId: parentRelationId,
        direction: "outgoing" as const,
        operator: "any" as const,
        recordIds: [parentRecordId],
      },
    ],
  };
  const totalFields = shown
    .flatMap((column) =>
      column.kind === "field" && (column.field.valueType === "number" || column.field.valueType === "currency")
        ? [{ fieldId: column.field.id, aggregation: "sum" as const }]
        : [],
    )
    .slice(0, 8);
  return {
    rows: (requested = page) =>
      RecordQuerySchema.parse({
        ...scope,
        page: requested,
        pageSize,
        sort: sort ? [{ fieldId: sort.field, direction: sort.direction }] : [],
        includeRelationships: shown.flatMap((column) => {
          const selection = column.kind === "relationship" ? parseRelationshipColumnKey(column.id) : null;
          return selection ? [selection] : [];
        }),
        includePaths: shown.flatMap((column) =>
          column.kind === "relationshipPath" ? [{ pathId: column.definition.id, limit: 3 }] : [],
        ),
      }),
    totals: totalFields.length
      ? RecordQuerySchema.parse({
          ...scope,
          pageSize: 1,
          grouping: { field: relationshipColumnKey(parentRelationId, "outgoing") },
          groupPage: { perGroup: 1 },
          groupSummaries: totalFields,
        })
      : null,
  };
}

export function embeddedTotals(result: RecordQueryResult | null) {
  return result?.grouping?.groups[0]?.summaries ?? [];
}
