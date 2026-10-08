"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";
import type { ConfigurationPreview } from "@/features/records/configuration.schema";
import type { RecordModelView } from "@/features/records/record-model.schema";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";

import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { AppModalActionRail, type AppModalActionProps } from "@/components/modal/app-modal-action";
import { AppModalCloseContext } from "@/components/modal/app-modal-close-context";
import { FormFooterActions } from "@/components/forms/form-footer-actions";
import { UnsavedChangesGuard } from "@/components/modal/unsaved-changes-guard";
import { keepOpenForAssistantSurface, releaseFocusToAssistantSurface } from "@/components/modal/assistant-surface";
import { usePreviewBlockers } from "./use-preview-blockers";

type SheetStore = BaseModalStore & {
  preview: ConfigurationPreview | null;
  model: RecordModelView;
  isReadOnly: boolean;
  previewReady: boolean;
  onSubmit: () => Promise<void>;
};

const FIRST_CONTROL =
  "input:not([type='hidden']), select, textarea, button, [contenteditable='true'], [tabindex]:not([tabindex='-1'])";

function focusFirstBodyControl(event: Event) {
  const content = event.currentTarget;
  if (!(content instanceof HTMLElement)) return;
  const body = content.querySelector<HTMLElement>("[data-slot='sheet-body']");
  if (!body) return;
  for (const candidate of body.querySelectorAll<HTMLElement>(FIRST_CONTROL)) {
    if (candidate.tabIndex < 0) continue;
    event.preventDefault();
    candidate.focus({ preventScroll: true });
    if (document.activeElement !== candidate) continue;
    if (candidate instanceof HTMLInputElement) candidate.select();
    return;
  }
}

export const ModelChangeSheet = observer(function ModelChangeSheet({
  store,
  title,
  creating = false,
  actions = [],
  children,
}: {
  store: SheetStore;
  title: string;
  creating?: boolean;
  actions?: readonly AppModalActionProps[];
  children: ReactNode;
}) {
  usePreviewBlockers(store.isOpen ? store.preview : null, store.model);
  const navigationGuard = store.rootStore.navigationGuard;
  const focusReturn = useOverlayFocusReturn(store.isOpen, store.focusReturnTarget, store.focusReturnFallback);
  useEffect(() => {
    if (!store.isOpen) return;
    navigationGuard.register(store);
    return () => navigationGuard.unregister(store);
  }, [navigationGuard, store, store.isOpen]);
  const requestClose = () => {
    if (store.withUnsavedChangesGuard && store.hasUnsavedChanges) store.setIsClosingWithGuard(true);
    else store.close();
  };
  const modalClose = { requestClose, guardsUnsavedChanges: true };
  return (
    <>
      <Sheet
        open={store.isOpen}
        onOpenChange={(open) => {
          if (!open) requestClose();
        }}
      >
        <SheetContent
          aria-describedby={undefined}
          className="w-full gap-0 bg-background sm:max-w-xl"
          data-configure-drawer=""
          overlayClassName="bg-black/10 backdrop-blur-none"
          side="right"
          onBlur={releaseFocusToAssistantSurface}
          onEscapeKeyDown={keepOpenForAssistantSurface}
          onInteractOutside={keepOpenForAssistantSurface}
          {...focusReturn}
          onOpenAutoFocus={(event) => {
            focusReturn.onOpenAutoFocus();
            focusFirstBodyControl(event);
          }}
        >
          <AppModalCloseContext.Provider value={modalClose}>
            <SheetHeader className="flex-row items-start gap-3 px-6 pt-[calc(1.5rem+var(--safe-top))] pr-[calc(3.125rem+var(--safe-right))] pb-4">
              <SheetTitle className="min-w-0 flex-1 truncate text-lg">{title}</SheetTitle>

              <AppModalActionRail actions={actions} className="-mt-4.5" />
            </SheetHeader>

            <SheetBody className="px-6 py-5">{children}</SheetBody>

            <SheetFooter className="px-6">
              <div className="flex shrink-0 items-center justify-end gap-2 max-sm:flex-col-reverse max-sm:items-stretch">
                <FormFooterActions
                  editable
                  dirty={!store.isReadOnly && (creating || store.hasUnsavedChanges || store.previewReady)}
                  placement="overlay"
                  saving={store.isLoading}
                  onSave={store.onSubmit}
                />
              </div>
            </SheetFooter>
          </AppModalCloseContext.Provider>
        </SheetContent>
      </Sheet>

      <UnsavedChangesGuard
        open={store.isClosingWithGuard}
        onCancel={() => store.setIsClosingWithGuard(false)}
        onConfirm={() => store.close()}
      />
    </>
  );
});
