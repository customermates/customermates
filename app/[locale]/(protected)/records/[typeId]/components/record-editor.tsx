"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { VisuallyHidden } from "radix-ui";
import type { RecordEditorStore } from "./record-editor.store";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { DiscardChangesDialog } from "@/components/modal/confirm-dialog";
import { keepOpenForAssistantSurface, releaseFocusToAssistantSurface } from "@/components/modal/assistant-surface";
import { RecordEditorContent } from "./record-editor-content";
import { useRootStore } from "@/core/stores/root-store.provider";

export const RecordEditor = observer(function RecordEditorDrawer({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  const root = useRootStore();
  const focusReturn = useOverlayFocusReturn(store.isOpen, store.focusReturnTarget, store.focusReturnFallback);
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);
  return (
    <>
      <Sheet
        open={store.isOpen}
        onOpenChange={(open) => {
          if (open) return;
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
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="w-full gap-0 bg-background sm:max-w-[640px]"
          side="left"
          onBlur={releaseFocusToAssistantSurface}
          onEscapeKeyDown={keepOpenForAssistantSurface}
          onInteractOutside={keepOpenForAssistantSurface}
          {...focusReturn}
          onOpenAutoFocus={(event) => {
            focusReturn.onOpenAutoFocus();
            event.preventDefault();
            if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus({ preventScroll: true });
          }}
        >
          <VisuallyHidden.Root>
            <SheetTitle>{type?.label ?? t("RecordModel.record")}</SheetTitle>
          </VisuallyHidden.Root>

          <SheetBody className="flex flex-col overflow-hidden px-0">
            <RecordEditorContent renderEditor={(child) => <RecordEditor store={child} />} store={store} />
          </SheetBody>
        </SheetContent>
      </Sheet>

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
