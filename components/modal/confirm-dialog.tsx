"use client";

import type { ReactNode } from "react";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardFooter } from "@/components/card/app-card-footer";
import { AppCardHeader } from "@/components/card/app-card-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OVERLAY_TOPMOST_LAYER_CLASS } from "@/components/ui/overlay-contract";
import { Spinner } from "@/components/ui/spinner";
import { useOverlayFocusReturn } from "@/components/ui/use-overlay-focus-return";
import { runUserAction } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";

export type ConfirmDialogProps = {
  open: boolean;
  title: ReactNode;
  description: ReactNode;
  children?: ReactNode;
  confirmLabel?: ReactNode;
  confirmVariant?: "default" | "destructive";
  confirmDisabled?: boolean;
  confirmationText?: string;
  busy?: boolean;
  anchorScope?: string;
  onCancel: () => void;
  onConfirm?: () => unknown;
  onCloseAutoFocus?: (event: Event) => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  children,
  confirmLabel,
  confirmVariant = "destructive",
  confirmDisabled = false,
  confirmationText,
  busy: busyProp = false,
  anchorScope,
  onCancel,
  onConfirm,
  onCloseAutoFocus,
}: ConfirmDialogProps) {
  const t = useTranslations();
  const focusReturn = useOverlayFocusReturn(open);
  const confirmationId = useId();
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState({ open, value: "" });
  if (typed.open !== open) setTyped({ open, value: "" });
  const typedValue = typed.open === open ? typed.value : "";
  const busy = busyProp || pending;
  const confirmationMissing = confirmationText !== undefined && typedValue.trim() !== confirmationText.trim();

  function confirm() {
    if (!onConfirm || busy) return;
    runUserAction(async () => {
      setPending(true);
      try {
        await onConfirm();
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent
        className={cn("flex flex-col gap-0 border-0 bg-transparent p-0 shadow-none", OVERLAY_TOPMOST_LAYER_CLASS)}
        data-slot="confirm-dialog"
        overlayClassName={OVERLAY_TOPMOST_LAYER_CLASS}
        size="sm"
        {...focusReturn}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (!event.defaultPrevented) focusReturn.onCloseAutoFocus(event);
        }}
      >
        <AppCard>
          <AppCardHeader>
            <AlertDialogTitle className="text-base font-semibold">{title}</AlertDialogTitle>
          </AppCardHeader>

          <AppCardBody>
            <AlertDialogDescription className="text-sm text-foreground">{description}</AlertDialogDescription>

            {children}

            {onConfirm && confirmationText !== undefined ? (
              <div className="space-y-2">
                <Label htmlFor={confirmationId}>
                  {t("Common.deleteConfirmation.typeToConfirm", {
                    name: confirmationText,
                  })}
                </Label>

                <Input
                  autoComplete="off"
                  data-slot="confirm-dialog-confirmation"
                  disabled={busy}
                  id={confirmationId}
                  value={typedValue}
                  onChange={(event) => setTyped({ open, value: event.target.value })}
                />
              </div>
            ) : null}
          </AppCardBody>

          <AppCardFooter data-slot="confirm-dialog-actions">
            <AlertDialogCancel disabled={busy} id={anchorScope ? `${anchorScope}-cancel` : undefined}>
              {onConfirm ? t("Common.actions.cancel") : t("Common.actions.close")}
            </AlertDialogCancel>

            {onConfirm ? (
              <AlertDialogAction
                aria-busy={busy || undefined}
                disabled={busy || confirmDisabled || confirmationMissing}
                id={anchorScope}
                variant={confirmVariant}
                onClick={(event) => {
                  event.preventDefault();
                  confirm();
                }}
              >
                {busy && <Spinner aria-label={t("Loading.text")} size="sm" />}

                {confirmLabel ?? t("Common.actions.confirm")}
              </AlertDialogAction>
            ) : null}
          </AppCardFooter>
        </AppCard>
      </AlertDialogContent>
    </AlertDialog>
  );
}

type DiscardChangesDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DiscardChangesDialog({ open, onCancel, onConfirm }: DiscardChangesDialogProps) {
  const t = useTranslations();

  return (
    <ConfirmDialog
      anchorScope="discard-changes"
      confirmLabel={t("Common.actions.discard")}
      description={t("Common.navigationGuard.message")}
      open={open}
      title={t("Common.navigationGuard.title")}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
