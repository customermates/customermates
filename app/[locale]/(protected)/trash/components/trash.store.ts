import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { ConfirmationSentence } from "@/components/modal/confirmation-sentence";
import type { MovedToTrash } from "@/features/trash/moved-to-trash";
import type { RestoreTrashData, TrashDeletionPreview, TrashItemDto } from "@/features/trash/trash.schema";

import { action, makeObservable, observable } from "mobx";
import { toast } from "sonner";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import {
  deleteTrashPermanentlyAction,
  emptyTrashAction,
  getTrashAction,
  previewTrashDeletionAction,
  restoreTrashAction,
} from "../actions";

const UNDO_TOAST_DURATION_MS = 8000;

export class TrashStore extends BaseDataViewStore<TrashItemDto> {
  isMutating = false;
  pendingRestoreOperation: string | null = null;
  private restoreListeners = new Set<() => unknown>();

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable<TrashStore, "setMutating" | "setPendingRestoreOperation">(this, {
      isMutating: observable,
      pendingRestoreOperation: observable,
      setMutating: action,
      setPendingRestoreOperation: action,
    });
    this.viewSyncToUrl = false;
  }

  get columnsDefinition(): TableColumn[] {
    return [
      { uid: "name", sortable: false },
      { uid: "kind", sortable: false, label: this.t("Trash.columns.kind") },
      { uid: "deletedBy", sortable: false, label: this.t("Trash.columns.deletedBy") },
      { uid: "deletedAt", sortable: false, label: this.t("Trash.columns.deletedAt") },
      { uid: "expiresAt", sortable: false, label: this.t("Trash.columns.expiresAt") },
    ];
  }

  override get supportsSelection() {
    return true;
  }

  get isAdmin() {
    return Boolean(this.rootStore.userStore.user?.role?.isSystemRole);
  }

  get canEmpty() {
    return this.isAdmin && (this.pagination?.total ?? this.items.length) > 0;
  }

  protected async refreshAction(params?: GetQueryParams) {
    return getTrashAction(params);
  }

  private setMutating(value: boolean) {
    this.isMutating = value;
  }

  private setPendingRestoreOperation(operationId: string | null) {
    this.pendingRestoreOperation = operationId;
  }

  private afterRestore = async () => {
    this.clearSelection();
    await Promise.all([
      this.isReady ? this.refreshQuery() : undefined,
      this.rootStore.recordWorkspaceStore.invalidate(),
      ...[...this.restoreListeners].map((listener) => listener()),
    ]);
  };

  restoreOperationCompleted = async () => {
    this.setPendingRestoreOperation(null);
    this.toastSuccess("Trash.restoredInBackground");
    await this.afterRestore();
  };

  restoreOperationStopped = () => {
    this.setPendingRestoreOperation(null);
  };

  onRestored = (listener: () => unknown) => {
    this.restoreListeners.add(listener);
    return () => this.restoreListeners.delete(listener);
  };

  announceMovedToTrash = ({ trashBatchId }: MovedToTrash, onRestored?: () => unknown) => {
    toast.success(this.t("Trash.movedToTrash"), {
      duration: UNDO_TOAST_DURATION_MS,
      action: {
        label: this.t("Trash.undo"),
        onClick: () =>
          runUserAction(async () => {
            if (await this.restore({ batchId: trashBatchId })) await onRestored?.();
          }),
      },
    });
  };

  restore = async (data: RestoreTrashData): Promise<boolean> => {
    if (this.isMutating) return false;
    this.setMutating(true);
    try {
      const result = await restoreTrashAction(data);
      if (!result.ok) {
        toastZodErrorTree(result.error);
        return false;
      }
      const outcome = result.data;
      if (outcome.status === "pending") {
        this.setPendingRestoreOperation(outcome.operationId);
        this.toastSuccess("Trash.restorePending");
        return true;
      }
      if (outcome.blocked.length > 0)
        this.toastError("Trash.restoreBlocked", { values: { count: outcome.blocked.length } });
      else if (outcome.droppedLinks > 0)
        this.toastSuccess("Trash.restoredWithDroppedLinks", { values: { count: outcome.droppedLinks } });
      else this.toastSuccess("Trash.restored", { values: { count: outcome.restoredItemIds.length } });
      const restored = outcome.restoredItemIds.length > 0;
      if (restored) await this.afterRestore();
      return restored;
    } finally {
      this.setMutating(false);
    }
  };

  restoreItems = (itemIds: string[]) => this.restore({ itemIds });

  private previewSentences(preview: TrashDeletionPreview): Array<string | ConfirmationSentence> {
    return [
      ...preview.removedRecords.map((list) =>
        this.t("Trash.permanentRecords", { list: list.label, count: list.count }),
      ),
      ...(preview.removedLinks === null
        ? [this.t("RecordModel.deletionRestrictedLinks")]
        : preview.removedLinks > 0
          ? [this.t("RecordModel.deletionLinks", { count: preview.removedLinks })]
          : []),
      this.t("Trash.permanentIrreversible"),
    ];
  }

  private confirmPermanent(
    preview: TrashDeletionPreview,
    title: string,
    onConfirm: () => Promise<boolean>,
    confirmationText?: string,
  ) {
    const store = this.rootStore.deleteConfirmationModalStore;
    store.onInitOrRefresh({
      title,
      message: this.t("Trash.permanentMessage", { count: preview.items.length }),
      details: this.previewSentences(preview),
      confirmLabel: this.t("Trash.deletePermanently"),
      confirmVariant: "destructive",
      successKey: "Trash.deletedPermanently",
      confirmationText,
      onConfirm,
    });
    store.open();
  }

  private afterPermanentDelete = async () => {
    this.clearSelection();
    await this.refreshQuery();
  };

  requestPermanentDelete = async (itemIds: string[], name?: string) => {
    if (itemIds.length === 0 || this.isMutating) return;
    const result = await previewTrashDeletionAction({ itemIds });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    const preview = result.data;
    const title =
      name !== undefined
        ? this.t("Trash.deletePermanentlyTitle", { name })
        : this.t("Trash.deletePermanentlyManyTitle", { count: itemIds.length });
    this.confirmPermanent(preview, title, async () => {
      const deleted = await deleteTrashPermanentlyAction({
        itemIds: preview.items.map((item) => item.itemId),
        expectedImpactHash: preview.impactHash,
      });
      if (!deleted.ok) {
        toastZodErrorTree(deleted.error);
        return false;
      }
      await this.afterPermanentDelete();
      return true;
    });
  };

  requestEmpty = async () => {
    if (!this.canEmpty || this.isMutating) return;
    const result = await previewTrashDeletionAction({ all: true });
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    const preview = result.data;
    this.confirmPermanent(
      preview,
      this.t("Trash.emptyTitle"),
      async () => {
        const emptied = await emptyTrashAction({ expectedImpactHash: preview.impactHash });
        if (!emptied.ok) {
          toastZodErrorTree(emptied.error);
          return false;
        }
        await this.afterPermanentDelete();
        return true;
      },
      this.t("Trash.emptyConfirmation"),
    );
  };

  get selectedItemIds() {
    return [...this.selectedIds];
  }
}
