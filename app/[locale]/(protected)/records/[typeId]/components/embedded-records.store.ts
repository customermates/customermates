import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";
import type { RecordColumn } from "@/features/records/record-columns";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordFieldSaveOutcome } from "./record-field-value-editor";

import { action, makeObservable, observable } from "mobx";

import { getP13nAction, upsertP13nAction } from "@/app/actions";
import { ViewMode } from "@/core/base/base-query-builder";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { readSublistColumns, sublistColumnsP13nId } from "@/features/p13n/sublist-columns.schema";
import { parseRelationshipColumnKey, relationshipColumnKey } from "@/features/records/record-column.schema";
import { defaultHiddenColumns } from "@/features/records/record-columns";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { mutateRecordAction, queryRecordsAction } from "../../actions";
import { RecordsStore } from "./records.store";

export const EMBEDDED_PAGE_SIZE = 10;

export function embeddedColumnLayout({
  columns,
  primaryColumnId,
  parentColumnId,
  defaultHidden,
  chosen,
}: {
  columns: Pick<RecordColumn, "id" | "kind">[];
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

export function embeddedPresentation(
  editor: Omit<RecordPresentationResult, "systemColumnLabels" | "query" | "result" | "typeId">,
  typeId: string,
  systemColumnLabels: RecordPresentationResult["systemColumnLabels"],
): RecordPresentationResult {
  const writable = editor.permittedActions.includes("update");
  return {
    ...editor,
    typeId,
    permittedActions: [
      ...editor.permittedActions.filter((action) => action === "readOwn" || action === "readAll"),
      ...(writable ? (["create", "update", "delete"] as const) : []),
    ],
    systemColumnLabels,
    query: RecordQuerySchema.parse({ typeId }),
    result: { items: [] },
  };
}

export class EmbeddedRecordsStore extends RecordsStore {
  parent: RecordRef | null = null;
  totals: RecordGroupSummaryResult[] = [];
  total = 0;
  loadFailed = false;
  columnChoice: string[] | null = null;
  private choiceRequest: Promise<void> | null = null;
  private choiceSaving: Promise<unknown> = Promise.resolve();
  constructor(
    rootStore: RootStore,
    presentation: RecordPresentationResult,
    private readonly parentRelationId: string,
    private readonly parentEditable: () => boolean,
    private readonly onChanged: () => Promise<void>,
  ) {
    super(rootStore, presentation);
    makeObservable(this, {
      parent: observable.ref,
      totals: observable.ref,
      total: observable,
      loadFailed: observable,
      columnChoice: observable.ref,
      setParent: action,
      setTotals: action,
      setLoadFailed: action,
    });
    const updateField = this.updateRecordField;
    const updateLinks = this.updateRecordLinks;
    this.updateRecordField = async (record, fieldId, value) =>
      this.afterSave(await updateField(record, fieldId, value));
    this.updateRecordLinks = async (record, changes) => this.afterSave(await updateLinks(record, changes));
  }
  override canUpdateRecord(record: RecordRow) {
    return super.canUpdateRecord(record) && this.parentEditable();
  }
  private afterSave = async (outcome: RecordFieldSaveOutcome) => {
    if (outcome.saved) await this.onChanged();
    return outcome;
  };
  setLoadFailed = (failed: boolean) => {
    this.loadFailed = failed;
  };
  load = async () => {
    try {
      await this.refresh();
      this.setLoadFailed(false);
    } catch {
      this.setLoadFailed(true);
    }
  };
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
  private get layout() {
    return embeddedColumnLayout({
      columns: this.recordColumns,
      primaryColumnId: this.primaryColumnId,
      parentColumnId: this.parentColumnId,
      defaultHidden: defaultHiddenColumns(this.presentation.typeId, this.presentation.model.fields),
      chosen: this.columnChoice,
    });
  }
  private get columnChoiceP13nId() {
    return sublistColumnsP13nId(this.presentation.typeId);
  }
  private applyColumnChoice = action((columns: string[] | null) => {
    this.columnChoice = columns;
    const { columnOrder, hiddenColumns } = this.layout;
    this.columnOrder = columnOrder;
    this.hiddenColumns = hiddenColumns;
    if (this.savedAppearance) this.savedAppearance = { ...this.savedAppearance, columnOrder, hiddenColumns };
  });
  private loadColumnChoice() {
    this.choiceRequest ??= getP13nAction({ p13nId: this.columnChoiceP13nId })
      .then((result) => {
        if (result.ok) this.applyColumnChoice(readSublistColumns(result.data?.settings)?.columns ?? null);
        else this.choiceRequest = null;
      })
      .catch(() => {
        this.choiceRequest = null;
      });
    return this.choiceRequest;
  }
  setColumnChoice = (columns: string[] | null) => {
    const previous = this.columnChoice;
    const fetched = () =>
      new Set(
        this.shownColumns.flatMap((column) =>
          column.kind === "relationship" || column.kind === "relationshipPath" ? [column.id] : [],
        ),
      );
    const before = fetched();
    this.applyColumnChoice(columns);
    const needsRows = [...fetched()].some((id) => !before.has(id));
    const saved = this.choiceSaving.then(async () => {
      const result = await upsertP13nAction({
        p13nId: this.columnChoiceP13nId,
        settings: columns ? { columns } : null,
      });
      if (!result.ok) {
        this.applyColumnChoice(previous);
        toastZodErrorTree(result.error);
        return;
      }
      if (needsRows && this.parent) await this.refresh();
    });
    this.choiceSaving = saved.catch(() => undefined);
    return saved.catch((error: unknown) => {
      this.applyColumnChoice(previous);
      throw error;
    });
  };
  private get shownColumns() {
    const hidden = new Set(this.layout.hiddenColumns);
    return this.recordColumns.filter((column) => !hidden.has(column.id));
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
    await this.onChanged();
    return { created: true };
  };
  protected override async refreshAction(params?: GetQueryParams): Promise<GetResult<RecordRow>> {
    const type = this.type;
    const parent = this.parent;
    if (!type || !parent) return { items: [], viewMode: ViewMode.table, viewPersistable: false };
    const sort = params?.sortDescriptor ?? this.sortDescriptor ?? undefined;
    const scope = {
      typeId: type.id,
      relationships: [
        { relationId: this.parentRelationId, direction: "outgoing", operator: "any", recordIds: [parent.recordId] },
      ],
    };
    await this.loadColumnChoice();
    const layout = this.layout;
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
      columnOrder: layout.columnOrder,
      hiddenColumns: layout.hiddenColumns,
      sortDescriptor: sort ?? undefined,
      viewMode: ViewMode.table,
      viewPersistable: false,
    };
  }
}
