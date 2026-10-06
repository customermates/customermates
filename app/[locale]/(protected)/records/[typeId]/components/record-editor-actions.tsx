"use client";

import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RotateCcw, Save, Trash2 } from "lucide-react";
import type { RecordEditorStore } from "./record-editor.store";
import type { useRecordDeletion } from "./use-record-deletion";
import { Button } from "@/components/ui/button";
import { AppModalAction } from "@/components/modal/app-modal-action";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import { useRecordDetailLayoutControls } from "./record-detail-personalization";

type Props = {
  store: RecordEditorStore;
  formId: string;
  name: string;
  deletion: ReturnType<typeof useRecordDeletion>;
  compact?: boolean;
  /** False when the delete action lives in the overlay header instead. */
  withDelete?: boolean;
};

function isDeleteBlocked(store: RecordEditorStore, deletion: Props["deletion"]) {
  return (
    deletion.isPreviewing ||
    store.hasUnsavedChanges ||
    store.hasRelatedDraft ||
    store.isLoading ||
    Boolean(store.pendingOperationId) ||
    store.refreshRequired
  );
}

function requestDeletion(store: RecordEditorStore, deletion: Props["deletion"], name: string) {
  return store.record
    ? deletion.requestDeletion(store.record, store.presentation.model.revision, name)
    : Promise.resolve();
}

/** Icon-only delete for the record drawer's header action rail. */
export const RecordDeleteAction = observer(function RecordDeleteAction({
  store,
  name,
  deletion,
}: Pick<Props, "store" | "name" | "deletion">) {
  const t = useTranslations();
  if (!store.record || !store.presentation.permittedActions.includes("delete")) return null;
  return (
    <AppModalAction
      anchorId="record-delete"
      disabled={isDeleteBlocked(store, deletion)}
      icon={Trash2}
      id="record-delete"
      label={t("Common.actions.delete")}
      variant="destructive"
      onClick={() => requestDeletion(store, deletion, name)}
    />
  );
});

export const RecordEditorActions = observer(function RecordEditorActions({
  store,
  formId,
  name,
  deletion,
  compact = false,
  withDelete = true,
}: Props) {
  const t = useTranslations();
  return (
    <>
      {withDelete && store.record && store.presentation.permittedActions.includes("delete") && (
        <Button
          aria-label={t("Common.actions.delete")}
          className={cn("text-destructive", compact ? "h-8" : "mr-auto")}
          disabled={isDeleteBlocked(store, deletion)}
          size={compact ? "sm" : "default"}
          type="button"
          variant={compact ? "secondary" : "ghost"}
          onClick={() => runUserAction(() => requestDeletion(store, deletion, name))}
        >
          <Trash2 aria-hidden className={cn("size-4", compact && "sm:hidden")} />

          <span className={cn(compact && "hidden sm:inline")}>{t("Common.actions.delete")}</span>
        </Button>
      )}

      {!store.isReadOnly && store.hasUnsavedChanges && (
        <Button
          aria-label={t("Common.actions.reset")}
          className={cn(compact && "h-8")}
          disabled={store.isLoading}
          size={compact ? "sm" : "default"}
          type="button"
          variant="secondary"
          onClick={store.resetForm}
        >
          <RotateCcw aria-hidden className={cn("size-4", compact && "sm:hidden")} />

          <span className={cn(compact && "hidden sm:inline")}>{t("Common.actions.reset")}</span>
        </Button>
      )}

      {!store.isReadOnly && (
        <Button
          aria-label={t("Common.actions.save")}
          className={cn(compact && "h-8")}
          disabled={store.isDisabled || (store.record !== null && !store.hasUnsavedChanges)}
          form={formId}
          size={compact ? "sm" : "default"}
          type="submit"
        >
          {compact && <Save aria-hidden className="size-4 sm:hidden" />}

          <span className={cn(compact && "hidden sm:inline")}>{t("Common.actions.save")}</span>
        </Button>
      )}
    </>
  );
});

export const RecordPageActions = observer(function RecordPageActions(props: Props) {
  const { store, formId, name, deletion } = props;
  const layoutControls = useRecordDetailLayoutControls(true);
  const record = store.record?.ref;
  const typeId = store.presentation.typeId;
  const isOpen = store.isOpen;
  const actions = useMemo(
    () => (
      <div data-record-page-actions className="flex items-center gap-1">
        <RecordAiAction
          registerContext
          active={isOpen}
          className="[&>span]:hidden sm:[&>span]:inline"
          context={{ reference: record ? { kind: "record", ...record } : { kind: "recordType", typeId }, label: name }}
        />

        {layoutControls}

        <RecordEditorActions compact deletion={deletion} formId={formId} name={name} store={store} />
      </div>
    ),
    [deletion, formId, isOpen, layoutControls, name, record, store, typeId],
  );
  useSetTopBarActions(actions);
  return null;
});
