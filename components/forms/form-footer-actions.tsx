"use client";

import type { BaseFormStore } from "@/core/base/base-form.store";
import type { LucideIcon } from "lucide-react";

import { useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RotateCcw, Save, X } from "lucide-react";

import { AppCardFooter } from "@/components/card/app-card-footer";
import { useAppModalClose } from "@/components/modal/app-modal-close-context";
import { DiscardChangesDialog } from "@/components/modal/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { focusFirstInvalidField } from "./focus-first-invalid-field";
import { useAppForm } from "./form-context";
import { shortcutScope, useFormFooterKeyboard } from "./use-form-footer-keyboard";

export type FormFooterReset = {
  differs: boolean;
  onReset: () => void;
};

type Props = {
  store?: BaseFormStore | null;
  editable?: boolean;
  dirty?: boolean;
  saving?: boolean;
  formId?: string;
  anchorScope?: string;
  placement?: "card" | "topbar" | "overlay";
  reset?: FormFooterReset;
  onCancel?: () => void;
  onSave?: () => void | Promise<void>;
};

export const FormFooterActions = observer(
  ({
    store: storeProp,
    editable,
    dirty: dirtyProp,
    saving: savingProp,
    formId,
    anchorScope,
    placement = "card",
    reset: resetProp,
    onCancel: onCancelProp,
    onSave,
  }: Props) => {
    const t = useTranslations();
    const contextStore = useAppForm();
    const modalClose = useAppModalClose();
    const { navigationGuard } = useRootStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const saveButtonRef = useRef<HTMLButtonElement>(null);
    const [confirmingDiscard, setConfirmingDiscard] = useState(false);
    const store = storeProp ?? contextStore;

    const isEditable = editable ?? (store ? store.canManage && !store.isReadOnly : true);
    const dirty = dirtyProp ?? store?.hasUnsavedChanges ?? false;
    const saving = savingProp ?? store?.isLoading ?? false;
    const isTopBar = placement === "topbar";
    const cancel = onCancelProp ?? (isTopBar ? undefined : modalClose?.requestClose);
    const cancelIsGuarded = !onCancelProp && Boolean(modalClose?.guardsUnsavedChanges);
    const confirmsLocally = Boolean(cancel) && !cancelIsGuarded && !store;
    const reset =
      resetProp ?? (!cancel && store ? { differs: store.hasUnsavedChanges, onReset: store.resetForm } : undefined);

    function requestCancel() {
      if (!cancel) return;
      if (cancelIsGuarded) cancel();
      else if (store) navigationGuard.tryNavigate(cancel);
      else if (dirty) setConfirmingDiscard(true);
      else cancel();
    }

    useFormFooterKeyboard({
      enabled: isEditable,
      containerRef,
      saveButtonRef,
      formId,
      interceptDismiss: () => {
        if (!cancel || cancelIsGuarded || !dirty) return false;
        requestCancel();
        return true;
      },
    });

    if (!isEditable) return null;

    const anchor = (suffix: string) => (anchorScope ? `${anchorScope}-${suffix}` : undefined);
    const isCompact = placement !== "card";
    const buttonSize = isCompact ? "sm" : undefined;
    const buttonClassName = isTopBar ? "h-8" : undefined;
    const label = (text: string, Icon: LucideIcon) =>
      isTopBar ? (
        <>
          <Icon aria-hidden className="size-4 sm:hidden" />

          <span className="hidden sm:inline">{text}</span>
        </>
      ) : (
        text
      );

    function save() {
      if (!onSave) return;
      runUserAction(async () => {
        await onSave();
        if (store?.error) focusFirstInvalidField(shortcutScope(containerRef.current, formId));
      });
    }

    const buttons = (
      <>
        {reset?.differs && (
          <Button
            aria-label={isTopBar ? t("Common.actions.reset") : undefined}
            className={cn(buttonClassName, !isTopBar && "sm:me-auto")}
            disabled={saving}
            id={anchor("reset")}
            size={buttonSize}
            type="button"
            variant="ghost"
            onClick={reset.onReset}
          >
            {label(t("Common.actions.reset"), RotateCcw)}
          </Button>
        )}

        {cancel && (
          <Button
            aria-label={isTopBar ? t("Common.actions.cancel") : undefined}
            className={buttonClassName}
            disabled={saving}
            id={anchor("cancel")}
            size={buttonSize}
            type="button"
            variant="secondary"
            onClick={requestCancel}
          >
            {label(t("Common.actions.cancel"), X)}
          </Button>
        )}

        {(!isTopBar || dirty || saving) && (
          <Button
            ref={saveButtonRef}
            aria-busy={saving || undefined}
            aria-label={isTopBar ? t("Common.actions.save") : undefined}
            className={buttonClassName}
            disabled={!dirty || saving}
            form={onSave ? undefined : formId}
            id={anchor("save")}
            size={buttonSize}
            type={onSave ? "button" : "submit"}
            variant="default"
            onClick={onSave ? save : undefined}
          >
            {saving ? (
              <Spinner aria-label={t("Loading.text")} size="sm" />
            ) : (
              isTopBar && <Save aria-hidden className="size-4 sm:hidden" />
            )}

            <span className={cn(isTopBar && "hidden sm:inline")}>{t("Common.actions.save")}</span>
          </Button>
        )}

        {cancel && confirmsLocally && (
          <DiscardChangesDialog
            open={confirmingDiscard}
            onCancel={() => setConfirmingDiscard(false)}
            onConfirm={() => {
              setConfirmingDiscard(false);
              cancel();
            }}
          />
        )}
      </>
    );

    if (isTopBar) {
      return (
        <div ref={containerRef} className="flex shrink-0 items-center gap-1" data-slot="form-footer-actions">
          {buttons}
        </div>
      );
    }

    if (placement === "overlay") {
      return (
        <div ref={containerRef} className="contents" data-slot="form-footer-actions">
          {buttons}
        </div>
      );
    }

    return (
      <AppCardFooter ref={containerRef} data-slot="form-footer-actions">
        {buttons}
      </AppCardFooter>
    );
  },
);
