"use client";

import type { ReactNode } from "react";
import type { BaseModalStore } from "@/core/base/base-modal.store";

import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { UnsavedChangesGuard } from "@/components/modal/unsaved-changes-guard";
import { keepOpenForAssistantSurface, releaseFocusToAssistantSurface } from "@/components/modal/assistant-surface";
import { runUserAction } from "@/core/errors/report-application-error";

type SheetStore = BaseModalStore & {
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
  submitLabel,
  children,
}: {
  store: SheetStore;
  title: string;
  submitLabel?: string;
  children: ReactNode;
}) {
  const t = useTranslations();
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
  const label =
    submitLabel ?? (store.previewReady && !store.isLoading ? t("RecordModel.apply") : t("Common.actions.save"));
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
          className="w-full gap-0 sm:max-w-xl"
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
          <SheetHeader className="pe-12">
            <SheetTitle className="min-w-0 truncate text-base">{title}</SheetTitle>
          </SheetHeader>

          <SheetBody className="py-5">{children}</SheetBody>

          <SheetFooter>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button disabled={store.isLoading} size="sm" type="button" variant="secondary" onClick={requestClose}>
                {t("Common.actions.cancel")}
              </Button>

              <Button
                disabled={store.isLoading || store.isReadOnly}
                size="sm"
                type="button"
                onClick={() => runUserAction(store.onSubmit)}
              >
                {label}
              </Button>
            </div>
          </SheetFooter>
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
