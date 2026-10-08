"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordEditorStore } from "./record-editor.store";
import { AppModal } from "@/components/modal/app-modal";
import { DiscardChangesDialog } from "@/components/modal/confirm-dialog";
import { RecordEditorContent } from "./record-editor-content";
import { useRootStore } from "@/core/stores/root-store.provider";

export const RecordEditor = observer(function RecordEditorDrawer({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  const root = useRootStore();
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);
  function requestClose() {
    const compose = root.threadComposeStore;
    if (compose.sourceContextKey === store.channelComposeKey && compose.isLoading) return;
    if (store.hasRelatedDraft) {
      const isCurrentRecord = store.captureSession();
      const isCurrentCompose = compose.captureContext();
      root.navigationGuard.tryNavigate(() => {
        if (!isCurrentRecord() || !isCurrentCompose() || compose.isLoading) return;
        compose.discardNewThread();
        store.resetForm();
        store.close();
      });
      return;
    }
    if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) store.setIsClosingWithGuard(true);
    else {
      if (compose.sourceContextKey === store.channelComposeKey) compose.discardNewThread();
      store.close();
    }
  }
  return (
    <>
      <AppModal
        focusContentOnOpen
        guardsUnsavedChanges
        bodyClassName="flex flex-col overflow-hidden px-0"
        focusReturnFallback={store.focusReturnFallback}
        focusReturnTarget={store.focusReturnTarget}
        open={store.isOpen}
        side="left"
        title={type?.label ?? t("RecordModel.record")}
        onClose={requestClose}
      >
        <RecordEditorContent renderEditor={(child) => <RecordEditor store={child} />} store={store} />
      </AppModal>

      <DiscardChangesDialog
        open={store.isClosingWithGuard}
        onCancel={() => store.setIsClosingWithGuard(false)}
        onConfirm={() => {
          if (root.threadComposeStore.sourceContextKey === store.channelComposeKey)
            root.threadComposeStore.discardNewThread();
          store.resetForm();
          store.close();
        }}
      />
    </>
  );
});
