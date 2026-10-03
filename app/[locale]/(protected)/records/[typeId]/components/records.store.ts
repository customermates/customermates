import type { GetResult } from "@/core/base/base-get.interactor";
import { action, computed, makeObservable, observable } from "mobx";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import type { MutateRecordInput } from "@/features/records/record-query.schema";
import type { RecordScalar } from "@/features/records/record-model.schema";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { recordColumns } from "@/features/records/record-columns";
import { recordColumnPresentation } from "@/features/records/record-presentation";
import { getRecordPresentationAction, mutateRecordAction, resetRecordViewAction } from "../../actions";

export class RecordsStore extends BaseDataViewStore<RecordRow> {
  presentation: RecordPresentationResult;
  pendingBoardOperation: string | null = null;
  pendingBulkOperation: string | null = null;
  isBulkMutating = false;
  private bulkRefreshGeneration = 0;
  private awaitingBulkRefresh: number | null = null;
  private bulkRefreshRetryNeeded = false;
  private readonly selectionRows = new Map<string, RecordRow>();
  private bulkRequest: { signature: string; input: MutateRecordInput } | null = null;
  private readonly movingRecords = new Set<string>();
  private readonly boardRequests = new Map<string, { signature: string; input: MutateRecordInput }>();
  private readonly loaded = new WeakMap<
    GetResult<RecordRow>,
    { presentation: RecordPresentationResult; bulkRefreshGeneration: number }
  >();
  constructor(rootStore: RootStore, presentation: RecordPresentationResult) {
    super(rootStore);
    this.presentation = presentation;
    this.schemaSettingsHref = presentation.canManageSchema
      ? `/company/data-model?typeId=${presentation.typeId}`
      : undefined;
    makeObservable<this, "awaitingBulkRefresh" | "bulkRefreshRetryNeeded">(this, {
      presentation: observable.ref,
      fields: computed,
      type: computed,
      recordColumns: computed,
      setPresentation: action,
      moveItemBetweenGroups: action.bound,
      pendingBoardOperation: observable,
      setBoardOperation: action,
      pendingBulkOperation: observable,
      isBulkMutating: observable,
      awaitingBulkRefresh: observable,
      bulkRefreshRetryNeeded: observable,
      canRetryBulkRefresh: computed,
      setBulkState: action,
      bulkCompleted: action,
      setBulkRefreshRetryNeeded: action,
    });
  }
  protected override onSelectionChanged() {
    for (const [id] of this.selectionRows) if (!this.selectedIds.has(id)) this.selectionRows.delete(id);
    for (const row of this.items ?? [])
      if (this.selectedIds.has(row.id) && !this.selectionRows.has(row.id)) this.selectionRows.set(row.id, row);
  }
  override get supportsSelection() {
    return (
      this.presentation.permittedActions.includes("update") || this.presentation.permittedActions.includes("delete")
    );
  }
  override isItemSelectable(item: RecordRow) {
    return !item.protectedKind && !this.isBulkMutating && !this.pendingBulkOperation;
  }
  get selectionTargets() {
    return [...this.selectedIds].map((id) => {
      const row = this.selectionRows.get(id);
      if (!row) throw new Error("A selected record must be reloaded before it can be changed.");
      return {
        ref: { typeId: row.ref.typeId, recordId: row.ref.recordId },
        expectedVersion: row.version,
      };
    });
  }
  setBulkState = (loading: boolean, operationId: string | null = this.pendingBulkOperation) => {
    this.isBulkMutating = loading || this.awaitingBulkRefresh !== null;
    this.pendingBulkOperation = operationId;
  };
  bulkCompleted = async () => {
    this.awaitingBulkRefresh = ++this.bulkRefreshGeneration;
    this.setBulkRefreshRetryNeeded(false);
    this.setBulkState(true);
    try {
      await this.rootStore.recordWorkspaceStore.invalidate();
      if (this.awaitingBulkRefresh !== null) await this.refreshQuery();
    } finally {
      this.setBulkRefreshRetryNeeded(this.awaitingBulkRefresh !== null);
    }
  };
  bulkStopped = () => this.setBulkState(false, null);
  setBulkRefreshRetryNeeded = (needed: boolean) => {
    this.bulkRefreshRetryNeeded = needed;
  };
  retryBulkRefresh = async () => {
    if (!this.canRetryBulkRefresh) return;
    this.setBulkRefreshRetryNeeded(false);
    try {
      await this.refreshQuery();
    } finally {
      this.setBulkRefreshRetryNeeded(this.awaitingBulkRefresh !== null);
    }
  };
  get canRetryBulkRefresh() {
    return this.awaitingBulkRefresh !== null && this.bulkRefreshRetryNeeded;
  }
  bulkMutation = async (mutation: Extract<MutateRecordInput["mutation"], { action: "updateMany" | "deleteMany" }>) => {
    if (this.isBulkMutating || this.pendingBulkOperation) return false;
    const signature = JSON.stringify({
      revision: this.presentation.model.revision,
      mutation,
    });
    const input =
      this.bulkRequest?.signature === signature
        ? this.bulkRequest.input
        : {
            expectedRevision: this.presentation.model.revision,
            idempotencyKey: crypto.randomUUID(),
            mutation,
          };
    this.bulkRequest = { signature, input };
    this.setBulkState(true);
    try {
      const result = await mutateRecordAction(input);
      this.bulkRequest = null;
      if (!result.ok) {
        toastZodErrorTree(result.error);
        await this.refresh();
        return false;
      }
      if (result.data.status === "pending") this.setBulkState(false, result.data.operationId);
      else {
        try {
          await this.bulkCompleted();
        } catch (error) {
          reportApplicationError(error);
        }
      }
      return true;
    } finally {
      this.setBulkState(false);
    }
  };
  bulkUpdateField = (fieldId: string, value: RecordScalar | null) =>
    this.bulkMutation({
      action: "updateMany",
      targets: this.selectionTargets,
      fields: [{ fieldId, value }],
    });
  setBoardOperation = (operationId: string | null) => {
    this.pendingBoardOperation = operationId;
  };
  boardOperationCompleted = async () => {
    this.setBoardOperation(null);
    await this.rootStore.recordWorkspaceStore.invalidate();
  };
  boardOperationStopped = () => {
    this.setBoardOperation(null);
  };
  override canMoveItemBetweenGroups(item: RecordRow): boolean {
    return !item.protectedKind;
  }
  override async moveItemBetweenGroups(
    params: Parameters<BaseDataViewStore<RecordRow>["moveItemBetweenGroups"]>[0],
  ): Promise<void> {
    const field = this.fields.find((field) => field.id === this.groupingResult?.columnId);
    if (
      !field ||
      !this.canMoveItemBetweenGroups(params.item) ||
      !this.groupingResult?.supportsDragWriteBack ||
      this.pendingBoardOperation ||
      this.movingRecords.has(params.item.id)
    )
      return;
    const value = params.value?.startsWith("value:") ? params.value.slice(6) : null;
    if (params.value !== null && (value === null || !field.options.some((option) => option.id === value))) return;
    this.movingRecords.add(params.item.id);
    try {
      let input: MutateRecordInput = {
        expectedRevision: this.presentation.model.revision,
        idempotencyKey: crypto.randomUUID(),
        mutation: {
          action: "update",
          ref: {
            typeId: params.item.ref.typeId,
            recordId: params.item.ref.recordId,
          },
          expectedVersion: params.item.version,
          fields: [
            {
              fieldId: field.id,
              value: value === null ? null : { kind: "select", value },
            },
          ],
        },
      };
      const signature = JSON.stringify({
        revision: input.expectedRevision,
        mutation: input.mutation,
      });
      const previous = this.boardRequests.get(params.item.id);
      if (previous?.signature === signature) input = previous.input;
      else this.boardRequests.set(params.item.id, { signature, input });
      const result = await mutateRecordAction(input);
      this.boardRequests.delete(params.item.id);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        await this.refresh();
      } else if (result.data.status === "pending") this.setBoardOperation(result.data.operationId);
      else await this.rootStore.recordWorkspaceStore.invalidate();
    } finally {
      this.movingRecords.delete(params.item.id);
    }
  }
  resetToSharedDefaults = async () => {
    await this.settleViewState();
    const result = await resetRecordViewAction({
      surfaceKey: recordSurfaceKey(this.presentation.typeId),
      viewKey: this.activeViewKey,
      fields: ["columnOrder", "columnWidths", "hiddenColumns", "viewMode", "grouping", "sortDescriptor"],
    });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    await this.reloadSavedView();
  };
  get fields() {
    return this.presentation.model.fields.filter(
      (field) => field.typeId === this.presentation.typeId && !field.archived,
    );
  }
  get type() {
    return this.presentation.model.types.find((type) => type.id === this.presentation.typeId);
  }
  override get recordLabels() {
    return this.type ? { singular: this.type.label, plural: this.type.pluralLabel } : undefined;
  }
  get columnsDefinition() {
    return this.recordColumns.map((column) => ({
      uid: column.id,
      label: column.label,
      sortable: column.sortable,
    }));
  }
  get recordColumns() {
    return recordColumns(this.presentation.typeId, this.presentation.model).map((column) => ({
      ...column,
      label:
        column.kind === "system" || column.kind === "identity"
          ? this.presentation.systemColumnLabels[column.id]
          : column.label,
    }));
  }
  override get viewTypeLabel() {
    return this.type?.pluralLabel;
  }
  get primaryColumnId() {
    return this.type?.primaryFieldId ?? super.primaryColumnId;
  }
  get filterColumns() {
    return [
      ...this.fields.map(recordColumnPresentation),
      ...this.recordColumns
        .filter((column) => column.kind !== "field" && column.kind !== "identity")
        .map((column) =>
          column.kind === "relationshipPath"
            ? {
                id: column.id,
                label: column.label,
                type: "recordReference" as const,
                typeId: column.targetTypeId,
              }
            : column.kind === "relationship"
              ? {
                  id: column.id,
                  label: column.label,
                  type: "recordReference" as const,
                  typeId: column.direction === "outgoing" ? column.relation.targetTypeId : column.relation.sourceTypeId,
                }
              : {
                  id: column.id,
                  label: column.label,
                  type: column.id === "system:assignedTo" ? ("member" as const) : ("dateTime" as const),
                },
        ),
    ];
  }
  get canManage() {
    return (
      this.presentation?.permittedActions.includes("create") || this.presentation?.permittedActions.includes("update")
    );
  }
  get canExport() {
    return true;
  }
  get isDisabled() {
    return !this.presentation?.permittedActions.includes("create");
  }
  setPresentation = (presentation: RecordPresentationResult) => {
    this.presentation = presentation;
  };
  protected onRefreshAccepted(result: GetResult<RecordRow>) {
    const loaded = this.loaded.get(result);
    if (loaded) this.setPresentation(loaded.presentation);
    if (loaded?.bulkRefreshGeneration === this.awaitingBulkRefresh && !result.grouping?.partial) {
      this.awaitingBulkRefresh = null;
      this.setBulkRefreshRetryNeeded(false);
      this.clearSelection();
      this.setBulkState(false, null);
    }
  }
  protected async refreshAction(params?: GetQueryParams) {
    const bulkRefreshGeneration = this.bulkRefreshGeneration;
    const presentation = await getRecordPresentationAction(this.presentation.typeId, params);
    this.loaded.set(presentation.result, { presentation, bulkRefreshGeneration });
    return presentation.result;
  }
}
