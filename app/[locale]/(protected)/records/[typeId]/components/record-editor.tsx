"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { VisuallyHidden } from "radix-ui";
import type { RecordEditorStore } from "./record-editor.store";
import { Sheet, SheetBody, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { UnsavedChangesGuard } from "@/components/modal/unsaved-changes-guard";
import { keepOpenForAssistantSurface, releaseFocusToAssistantSurface } from "@/components/modal/assistant-surface";
import { RecordEditorContent } from "./record-editor-content";

export const RecordEditor = observer(function RecordEditorDrawer({ store }: { store: RecordEditorStore }) {
  const t = useTranslations();
  const focusReturn = useOverlayFocusReturn(store.isOpen, store.focusReturnTarget, store.focusReturnFallback);
  const type = store.presentation.model.types.find((type) => type.id === store.presentation.typeId);
  return (
    <>
      <Sheet
        open={store.isOpen}
        onOpenChange={(open) => {
          if (open) return;
          if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) store.setIsClosingWithGuard(true);
          else store.close();
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="w-full gap-0 sm:max-w-[640px]"
          side="left"
          onBlur={releaseFocusToAssistantSurface}
          onEscapeKeyDown={keepOpenForAssistantSurface}
          onInteractOutside={keepOpenForAssistantSurface}
          {...focusReturn}
        >
          <VisuallyHidden.Root>
            <SheetTitle>{type?.label ?? t("RecordModel.record")}</SheetTitle>
          </VisuallyHidden.Root>

          <SheetBody className="flex flex-col overflow-hidden px-0">
            <RecordEditorContent renderEditor={(child) => <RecordEditor store={child} />} store={store} />
          </SheetBody>
        </SheetContent>
      </Sheet>

      <UnsavedChangesGuard
        open={store.isClosingWithGuard}
        onCancel={() => store.setIsClosingWithGuard(false)}
        onConfirm={() => {
          store.resetForm();
          store.close();
        }}
      />
    </>
  );
});
