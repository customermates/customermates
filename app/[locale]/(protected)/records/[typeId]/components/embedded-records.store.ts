import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordGroupSummaryResult } from "@/features/records/record-grouping.schema";
import type { RecordQueryResult } from "@/features/records/record-query-result.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { EmbeddedSublistPage } from "@/features/records/embedded-sublist";
import type { RecordFieldSaveOutcome } from "./record-field-value-editor";

import { action, makeObservable, observable } from "mobx";

import { getP13nAction, upsertP13nAction } from "@/app/actions";
import { ViewMode } from "@/core/base/base-query-builder";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { readSublistColumns, sublistColumnsP13nId } from "@/features/p13n/sublist-columns.schema";
import { relationshipColumnKey } from "@/features/records/record-column.schema";
import {
  EMBEDDED_PAGE_SIZE,
  embeddedSublistLayout,
  embeddedSublistQueries,
  embeddedTotals,
} from "@/features/records/embedded-sublist";
import { RecordQuerySchema } from "@/features/records/record-query.schema";
import { mutateRecordAction, queryRecordsAction } from "../../actions";
import { RecordsStore } from "./records.store";

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
    return embeddedSublistLayout(
      this.presentation.model,
      this.presentation.typeId,
      this.parentRelationId,
      this.columnChoice,
    );
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
    return this.layout.shown;
  }
  hydrate = (page: EmbeddedSublistPage) => {
    this.choiceRequest = Promise.resolve();
    this.applyColumnChoice(page.columns);
    this.setTotals(page.totals, page.rows.total);
    this.setItems(this.rowsResult(page.rows, EMBEDDED_PAGE_SIZE));
    this.setLoadFailed(false);
  };
  private rowsResult(
    rows: RecordQueryResult,
    pageSize: NonNullable<GetResult<RecordRow>["pagination"]>["pageSize"],
    sort?: GetQueryParams["sortDescriptor"],
  ): GetResult<RecordRow> {
    const { columnOrder, hiddenColumns } = this.layout;
    return {
      items: rows.records.map((record) => ({ ...record, id: record.ref.recordId })) as RecordRow[],
      pagination: {
        page: rows.page,
        pageSize,
        total: rows.total,
        totalPages: Math.max(1, Math.ceil(rows.total / pageSize)),
      },
      columnOrder,
      hiddenColumns,
      sortDescriptor: sort ?? undefined,
      viewMode: ViewMode.table,
      viewPersistable: false,
    };
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
    await this.loadColumnChoice();
    const page = params?.pagination?.page ?? params?.page ?? 1;
    const pageSize = params?.pagination?.pageSize ?? this.pagination?.pageSize ?? EMBEDDED_PAGE_SIZE;
    const queries = embeddedSublistQueries({
      typeId: type.id,
      parentRelationId: this.parentRelationId,
      parentRecordId: parent.recordId,
      shown: this.shownColumns,
      page,
      pageSize,
      sort,
    });
    const [loaded, totals] = await Promise.all([
      queryRecordsAction(queries.rows()),
      queries.totals ? queryRecordsAction(queries.totals) : Promise.resolve(null),
    ]);
    const lastPage = loaded.ok ? Math.max(1, Math.ceil(loaded.data.total / pageSize)) : 1;
    const rows =
      loaded.ok && !loaded.data.records.length && page > lastPage
        ? await queryRecordsAction(queries.rows(lastPage))
        : loaded;
    if (!rows.ok) throw new Error("The sub-list could not be loaded.");
    this.setTotals(embeddedTotals(totals?.ok ? totals.data : null), rows.data.total);
    return this.rowsResult(rows.data, pageSize, sort);
  }
}
