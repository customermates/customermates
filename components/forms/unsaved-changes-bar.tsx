"use client";

import type { RefObject } from "react";
import type { BaseFormStore } from "@/core/base/base-form.store";

import { useLayoutEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { cn } from "@/core/utils/cn";

import { FormFooterActions } from "./form-footer-actions";

type UnsavedChangesMode = "bar" | "none";

const UNSAVED_CHANGES_BAR_SPACE = "--unsaved-changes-bar-space";
const UNSAVED_CHANGES_BAR_CLEARANCE = "--unsaved-changes-bar-clearance";
const bottomBarClearances = new Map<HTMLElement, number>();

function updateBottomBarClearance() {
  const root = document.documentElement;
  if (bottomBarClearances.size)
    root.style.setProperty(UNSAVED_CHANGES_BAR_CLEARANCE, `${Math.max(...bottomBarClearances.values())}px`);
  else root.style.removeProperty(UNSAVED_CHANGES_BAR_CLEARANCE);
}

export function unsavedChangesMode({
  creating = false,
  dirty,
  editable,
}: {
  creating?: boolean;
  dirty: boolean;
  editable: boolean;
}): UnsavedChangesMode {
  if (!editable) return "none";
  return creating || dirty ? "bar" : "none";
}

export function useBottomBarClearance(ref: RefObject<HTMLElement | null>, visible = true) {
  useLayoutEffect(() => {
    if (!visible) return;
    const bar = ref.current;
    if (!bar) return;
    const update = () => {
      const { top, bottom } = bar.getBoundingClientRect();
      const clearance = top < window.innerHeight && bottom > window.innerHeight / 2 ? window.innerHeight - top : 0;
      bottomBarClearances.set(bar, Math.max(0, Math.ceil(clearance)));
      updateBottomBarClearance();
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(bar);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      bottomBarClearances.delete(bar);
      updateBottomBarClearance();
    };
  }, [ref, visible]);
}

type Props = {
  store?: BaseFormStore;
  creating?: boolean;
  dirty?: boolean;
  editable?: boolean;
  formId?: string;
  anchorScope?: string;
  compact?: boolean;
  saving?: boolean;
  saveLabel?: string;
  placement?: "overlay" | "sticky";
  onCancel?: () => void;
  onDismiss?: () => void;
  onSave?: () => void | Promise<void>;
};

export const UnsavedChangesBar = observer(function UnsavedChangesBar({
  store,
  creating = false,
  dirty: dirtyProp,
  editable: editableProp,
  formId,
  anchorScope,
  compact = false,
  saving: savingProp,
  saveLabel,
  placement = "overlay",
  onCancel,
  onDismiss,
  onSave,
}: Props) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);
  const dirty = dirtyProp ?? store?.hasUnsavedChanges ?? !creating;
  const editable = editableProp ?? (store ? store.canManage && !store.isReadOnly : true);
  const saving = savingProp ?? store?.isLoading ?? false;
  const visible = unsavedChangesMode({ creating, dirty, editable }) === "bar";

  useLayoutEffect(() => {
    const bar = containerRef.current;
    const host = bar?.parentElement;
    if (!visible || placement !== "overlay" || !bar || !host) return;
    const update = () => {
      const offset = Number.parseFloat(getComputedStyle(bar).bottom) || 0;
      host.style.setProperty(UNSAVED_CHANGES_BAR_SPACE, `${bar.offsetHeight + offset}px`);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(bar);
    return () => {
      observer?.disconnect();
      host.style.removeProperty(UNSAVED_CHANGES_BAR_SPACE);
    };
  }, [placement, visible]);

  useBottomBarClearance(containerRef, visible);

  if (!visible) return null;

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      className={cn(
        "z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-popover p-2 ps-3 text-popover-foreground shadow-lg",
        "animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none",
        compact && "w-full",
        placement === "overlay"
          ? "absolute inset-x-2.5 bottom-[calc(0.625rem+var(--safe-bottom))]"
          : "sticky bottom-[calc(0.625rem+var(--safe-bottom))]",
      )}
      data-slot="unsaved-changes-bar"
      role="status"
    >
      {dirty ? (
        <span className={cn("flex min-w-0 items-center gap-2 text-sm font-medium", compact ? "w-full" : "flex-1")}>
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />

          <span className="truncate">{t("Common.unsavedChanges")}</span>

          <ShortcutKeys className="ms-1" id="save" />
        </span>
      ) : (
        <ShortcutKeys className="me-auto" id="save" />
      )}

      <span
        className={cn(
          "flex items-center gap-2",
          compact ? "w-full [&_button]:flex-1" : "max-sm:w-full max-sm:[&_button]:flex-1",
        )}
      >
        <FormFooterActions
          anchorScope={anchorScope}
          creating={creating}
          dirty={dirty}
          editable={editable}
          formId={formId}
          placement="overlay"
          saveLabel={saveLabel}
          saving={saving}
          store={store ?? null}
          onCancel={creating ? onCancel : onDismiss}
          onRevert={creating ? undefined : (onCancel ?? store?.resetForm)}
          onSave={onSave}
        />
      </span>
    </div>
  );
});
