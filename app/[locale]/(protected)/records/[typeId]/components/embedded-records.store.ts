import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";
import type { RecordRow } from "@/features/records/record-presentation";

import { action, makeObservable, observable } from "mobx";

import { ViewMode } from "@/core/base/base-query-builder";
import { parseRelationshipColumnKey, relationshipColumnKey } from "@/features/records/record-column.schema";
import { recordDefaults } from "@/features/records/record-presentation";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { mutateRecordAction, queryRecordsAction } from "../../actions";
import { RecordsStore } from "./records.store";

export const EMBEDDED_PAGE_SIZE = 10;

export function embeddedPresentation(
  editor: Omit<RecordPresentationResult, "systemColumnLabels" | "query" | "result" | "typeId">,
  typeId: string,
  systemColumnLabels: RecordPresentationResult["systemColumnLabels"],
): RecordPresentationResult {
  return { ...editor, typeId, systemColumnLabels, query: RecordQuerySchema.parse({ typeId }), result: { items: [] } };
}

export class EmbeddedRecordsStore extends RecordsStore {
  parent: RecordRef | null = null;
  totals: RecordGroupSummaryResult[] = [];
  total = 0;
  constructor(
    rootStore: RootStore,
    presentation: RecordPresentationResult,
    private readonly parentRelationId: string,
  ) {
    super(rootStore, presentation);
    makeObservable(this, {
      parent: observable.ref,
      totals: observable.ref,
      total: observable,
      setParent: action,
      setTotals: action,
    });
  }
  override get supportsSelection() {
    return false;
  }
  override get canBoard() {
    return false;
  }
  get parentColumnId() {
    return relationshipColumnKey(this.parentRelationId, "outgoing");
  }
  setParent = (parent: RecordRef | null) => {
    this.parent = parent;
  };
  setTotals = (totals: RecordGroupSummaryResult[], total: number) => {
    this.totals = totals;
    this.total = total;
  };
  private get shownColumns() {
    const type = this.type;
    if (!type) return [];
    return this.recordColumns.filter(
      (column) =>
        column.id !== this.parentColumnId &&
        (column.id === type.primaryFieldId || type.defaults.columns.includes(column.id)),
    );
  }
  private get totalFields() {
    return this.shownColumns
      .flatMap((column) =>
        column.kind === "field" && (column.field.valueType === "number" || column.field.valueType === "currency")
          ? [{ fieldId: column.field.id, aggregation: "sum" as const }]
          : [],
      )
      .slice(0, 8);
  }
  createChild = async (fieldId: string, name: string) => {
    if (!this.parent) return { created: false };
    const result = await mutateRecordAction({
      expectedRevision: this.presentation.model.revision,
      idempotencyKey: crypto.randomUUID(),
      mutation: {
        action: "create",
        typeId: this.presentation.typeId,
        fields: [{ fieldId, value: { kind: "text", value: name } }],
        links: [{ relationId: this.parentRelationId, direction: "outgoing", record: this.parent }],
      },
    });
    if (!result.ok) return { created: false };
    await this.refresh();
    return { created: true };
  };
  protected override async refreshAction(params?: GetQueryParams): Promise<GetResult<RecordRow>> {
    const type = this.type;
    const parent = this.parent;
    const defaults = type ? recordDefaults(type) : undefined;
    if (!type || !parent) return { items: [], viewMode: ViewMode.table, viewPersistable: false };
    const sort = params?.sortDescriptor ?? this.sortDescriptor ?? defaults?.sortDescriptor ?? undefined;
    const scope = {
      typeId: type.id,
      relationships: [
        { relationId: this.parentRelationId, direction: "outgoing", operator: "any", recordIds: [parent.recordId] },
      ],
    };
    const shown = this.shownColumns;
    const page = params?.pagination?.page ?? params?.page ?? 1;
    const pageSize = params?.pagination?.pageSize ?? this.pagination?.pageSize ?? EMBEDDED_PAGE_SIZE;
    const rowsQuery = (requested: number) =>
      queryRecordsAction(
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
      );
    const [loaded, totals] = await Promise.all([
      rowsQuery(page),
      this.totalFields.length
        ? queryRecordsAction(
            RecordQuerySchema.parse({
              ...scope,
              pageSize: 1,
              grouping: { field: this.parentColumnId },
              groupPage: { perGroup: 1 },
              groupSummaries: this.totalFields,
            }),
          )
        : Promise.resolve(null),
    ]);
    const lastPage = loaded.ok ? Math.max(1, Math.ceil(loaded.data.total / pageSize)) : 1;
    const rows = loaded.ok && !loaded.data.records.length && page > lastPage ? await rowsQuery(lastPage) : loaded;
    if (!rows.ok) throw new Error("The sub-list could not be loaded.");
    const group = totals?.ok ? totals.data.grouping?.groups[0] : undefined;
    this.setTotals(group?.summaries ?? [], rows.data.total);
    return {
      items: rows.data.records.map((record) => ({ ...record, id: record.ref.recordId })) as RecordRow[],
      pagination: {
        page: rows.data.page,
        pageSize,
        total: rows.data.total,
        totalPages: Math.max(1, Math.ceil(rows.data.total / pageSize)),
      },
      columnOrder: type.defaults.columns,
      hiddenColumns: this.recordColumns.filter((column) => !shown.includes(column)).map((column) => column.id),
      sortDescriptor: sort ?? undefined,
      viewMode: ViewMode.table,
      viewPersistable: false,
    };
  }
}
