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
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { useSetTopBarActions } from "@/app/components/topbar-actions-context";
import {
  RecordDetailCustomizeAction,
  RecordDetailLayoutStatus,
  useRecordDetailLayout,
} from "./record-detail-personalization";

type Props = {
  store: RecordEditorStore;
  formId: string;
  name: string;
  deletion: ReturnType<typeof useRecordDeletion>;
};

/** Icon-only record delete, shown in the drawer header rail and the record page top bar. */
export const RecordDeleteAction = observer(function RecordDeleteAction({
  store,
  name,
  deletion,
}: Omit<Props, "formId">) {
  const t = useTranslations();
  if (!store.record || !store.presentation.permittedActions.includes("delete")) return null;
  return (
    <AppModalAction
      disabled={deletion.isPreviewing || store.isBusy}
      icon={Trash2}
      id="record-delete"
      label={t("Common.actions.delete")}
      variant="destructive"
      onClick={() =>
        store.record ? deletion.requestDeletion(store.record, store.presentation.model.revision, name) : undefined
      }
    />
  );
});

export const RecordEditorActions = observer(function RecordEditorActions({
  store,
  formId,
  compact = false,
}: Pick<Props, "store" | "formId"> & { compact?: boolean }) {
  const t = useTranslations();
  return (
    <>
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
  const layout = useRecordDetailLayout();
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

        {layout && <RecordDetailCustomizeAction {...layout} />}

        {layout && <RecordDetailLayoutStatus {...layout} />}

        <RecordDeleteAction deletion={deletion} name={name} store={store} />

        <RecordEditorActions compact formId={formId} store={store} />
      </div>
    ),
    [deletion, formId, isOpen, layout, name, record, store, typeId],
  );
  useSetTopBarActions(actions);
  return null;
});
