import type { TableColumn } from "@/core/base/base-data-view.store";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RootStore } from "@/core/stores/root.store";
import type { ConfirmationSentence } from "@/components/modal/confirmation-sentence";
import type { MovedToTrash } from "@/features/trash/moved-to-trash";
import type {
  RestoreTrashData,
  TrashDeletionPreview,
  TrashDeletionResult,
  TrashItemDto,
  TrashKind,
  TrashRestoreBlocker,
} from "@/features/trash/trash.schema";

import { action, makeObservable, observable, runInAction } from "mobx";
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

const RESTORE_BLOCKED_KEYS: Record<TrashRestoreBlocker["reason"], string> = {
  listDeleted: "Trash.restoreBlocked.listDeleted",
  parentDeleted: "Trash.restoreBlocked.parentDeleted",
  notFound: "Trash.restoreBlocked.notFound",
  requiresRestore: "Trash.restoreBlocked.requiresRestore",
  nameTaken: "Trash.restoreBlocked.nameTaken",
};

const countBy = <T>(values: T[]) =>
  values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map<T, number>());

const UNDO_TOAST_DURATION_MS = 8000;

const CONFIGURATION_TRASH_KINDS: readonly TrashKind[] = ["list", "field", "relationship", "channels"];

export class TrashStore extends BaseDataViewStore<TrashItemDto> {
  isMutating = false;
  pendingRestoreOperation: string | null = null;

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
      { uid: "deletedAt", sortable: true, label: this.t("Trash.columns.deletedAt") },
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

  private async whileMutating<T>(work: () => Promise<T>): Promise<T> {
    this.setMutating(true);
    try {
      return await work();
    } finally {
      this.setMutating(false);
    }
  }

  private setPendingRestoreOperation(operationId: string | null) {
    this.pendingRestoreOperation = operationId;
  }

  private afterRestore = async () => {
    this.clearSelection();
    await Promise.all([
      this.isReady ? this.refreshQuery() : undefined,
      this.rootStore.recordWorkspaceStore.invalidate(),
      this.rootStore.recordWorkspaceStore.refreshNavigation(),
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

  announceMovedToTrash = ({ trashBatchId }: MovedToTrash, onRestored?: () => unknown) => {
    toast.success(this.t("Trash.movedToTrash"), {
      duration: UNDO_TOAST_DURATION_MS,
      action: {
        label: this.t("Trash.undo"),
        onClick: () =>
          runUserAction(async () => {
            if ((await this.restore({ batchId: trashBatchId })) === "restored") await onRestored?.();
          }),
      },
    });
  };

  restore = async (data: RestoreTrashData): Promise<"restored" | "pending" | false> => {
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
        return "pending";
      }
      const restoredCount = outcome.restoredItemIds.length;
      if (restoredCount > 0 && outcome.droppedLinks > 0)
        this.toastSuccess("Trash.restoredWithDroppedLinks", { values: { count: outcome.droppedLinks } });
      else if (restoredCount > 0) this.toastSuccess("Trash.restored", { values: { count: restoredCount } });
      for (const [reason, count] of countBy(outcome.blocked.map((blocker) => blocker.reason)))
        this.toastError(RESTORE_BLOCKED_KEYS[reason], { values: { count } });
      if (restoredCount === 0) return false;
      await this.afterRestore();
      return "restored";
    } finally {
      this.setMutating(false);
    }
  };

  restoreItems = async (itemIds: string[]) => (await this.restore({ itemIds })) !== false;

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

  /** Items that went to the background or failed stay in Trash, so the toast must not claim they are gone. */
  private reportDeletion(result: TrashDeletionResult) {
    const successKey = result.failedItemIds.length
      ? "Trash.deletionPartlyFailed"
      : result.pendingItemIds.length
        ? "Trash.deletionPending"
        : "Trash.deletedPermanently";
    runInAction(() => {
      this.rootStore.deleteConfirmationModalStore.form.successKey = successKey;
    });
  }

  private afterPermanentDelete = async () => {
    this.clearSelection();
    await Promise.all([
      this.isReady ? this.refreshQuery() : undefined,
      this.rootStore.recordWorkspaceStore.refreshNavigation(),
    ]);
  };

  requestPermanentDelete = async (itemIds: string[], name?: string, onDeleted?: () => unknown) => {
    if (itemIds.length === 0 || this.isMutating) return;
    const result = await this.whileMutating(() => previewTrashDeletionAction({ itemIds }));
    if (!result.ok) {
      toastZodErrorTree(result.error);
      return;
    }
    const preview = result.data;
    const title =
      name !== undefined
        ? this.t("Trash.deletePermanentlyTitle", { name })
        : this.t("Trash.deletePermanentlyManyTitle", { count: itemIds.length });
    const configuration =
      preview.items.length === 1 && CONFIGURATION_TRASH_KINDS.includes(preview.items[0].kind) ? name : undefined;
    this.confirmPermanent(
      preview,
      title,
      async () => {
        const deleted = await deleteTrashPermanentlyAction({
          itemIds: preview.items.map((item) => item.itemId),
          expectedImpactHash: preview.impactHash,
        });
        if (!deleted.ok) {
          toastZodErrorTree(deleted.error);
          return false;
        }
        this.reportDeletion(deleted.data);
        await this.afterPermanentDelete();
        await onDeleted?.();
        return true;
      },
      configuration,
    );
  };

  requestEmpty = async () => {
    if (!this.canEmpty || this.isMutating) return;
    const result = await this.whileMutating(() => previewTrashDeletionAction({ all: true }));
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
        this.reportDeletion(emptied.data);
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
