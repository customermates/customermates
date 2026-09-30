import type { GetResult } from "@/core/base/base-get.interactor";
import { action, computed, makeObservable, observable } from "mobx";

import type { RootStore } from "@/core/stores/root.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import type { MutateRecordInput } from "@/features/records/record-query.schema";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { recordColumnPresentation } from "@/features/records/record-presentation";
import { recordColumns } from "@/features/records/record-columns";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { recordSurfaceKey } from "@/core/data-view/data-view-keys";
import { getRecordPresentationAction, resetRecordViewAction, mutateRecordAction } from "../../actions";

export class RecordsStore extends BaseDataViewStore<RecordRow> {
  presentation: RecordPresentationResult;
  pendingBoardOperation: string | null = null;
  private readonly movingRecords = new Set<string>();
  private readonly boardRequests = new Map<string, { signature: string; input: MutateRecordInput }>();
  private readonly loaded = new WeakMap<GetResult<RecordRow>, RecordPresentationResult>();
  constructor(rootStore: RootStore, presentation: RecordPresentationResult) {
    super(rootStore);
    this.presentation = presentation;
    makeObservable(this, {
      presentation: observable.ref,
      fields: computed,
      type: computed,
      recordColumns: computed,
      setPresentation: action,
      pendingBoardOperation: observable,
      setBoardOperation: action,
    });
  }
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
          ref: { typeId: params.item.ref.typeId, recordId: params.item.ref.recordId },
          expectedVersion: params.item.version,
          fields: [{ fieldId: field.id, value: value === null ? null : { kind: "select", value } }],
        },
      };
      const signature = JSON.stringify({ revision: input.expectedRevision, mutation: input.mutation });
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
  get columnsDefinition() {
    return this.recordColumns.map((column) => ({ uid: column.id, label: column.label, sortable: column.sortable }));
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
            ? { id: column.id, label: column.label, type: "recordReference" as const, typeId: column.targetTypeId }
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
  get canUpdateSelection() {
    return false;
  }
  get canDeleteSelection() {
    return false;
  }
  get isDisabled() {
    return !this.presentation?.permittedActions.includes("create");
  }
  setPresentation = (presentation: RecordPresentationResult) => {
    this.presentation = presentation;
  };
  protected onRefreshAccepted(result: GetResult<RecordRow>) {
    const presentation = this.loaded.get(result);
    if (presentation) this.setPresentation(presentation);
  }
  protected async refreshAction(params?: GetQueryParams) {
    const presentation = await getRecordPresentationAction(this.presentation.typeId, params);
    this.loaded.set(presentation.result, presentation);
    return presentation.result;
  }
}
