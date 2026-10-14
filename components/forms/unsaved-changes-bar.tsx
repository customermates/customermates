"use client";

import { useLayoutEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { cn } from "@/core/utils/cn";

import { FormFooterActions } from "./form-footer-actions";

type UnsavedChangesMode = "footer" | "bar" | "none";

const UNSAVED_CHANGES_BAR_SPACE = "--unsaved-changes-bar-space";
const UNSAVED_CHANGES_BAR_CLEARANCE = "--unsaved-changes-bar-clearance";

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
  if (creating) return "footer";
  return dirty ? "bar" : "none";
}

type Props = {
  formId?: string;
  anchorScope?: string;
  saving?: boolean;
  placement?: "overlay" | "sticky";
  onCancel: () => void;
};

export function UnsavedChangesBar({ formId, anchorScope, saving = false, placement = "overlay", onCancel }: Props) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = containerRef.current;
    const host = bar?.parentElement;
    if (placement !== "overlay" || !bar || !host) return;
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
  }, [placement]);

  useLayoutEffect(() => {
    const bar = containerRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const update = () => {
      const { top, bottom } = bar.getBoundingClientRect();
      const clearance = top < window.innerHeight && bottom > window.innerHeight / 2 ? window.innerHeight - top : 0;
      root.style.setProperty(UNSAVED_CHANGES_BAR_CLEARANCE, `${Math.max(0, Math.ceil(clearance))}px`);
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
      root.style.removeProperty(UNSAVED_CHANGES_BAR_CLEARANCE);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-live="polite"
      className={cn(
        "z-20 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-popover p-2 ps-3 text-popover-foreground shadow-lg",
        "animate-in fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none",
        placement === "overlay"
          ? "absolute inset-x-2.5 bottom-[calc(0.625rem+var(--safe-bottom))]"
          : "sticky bottom-[calc(0.625rem+var(--safe-bottom))]",
      )}
      data-slot="unsaved-changes-bar"
      role="status"
    >
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-primary" />

        <span className="truncate">{t("Common.unsavedChanges")}</span>

        <ShortcutKeys className="ms-1" id="save" />
      </span>

      <span className="flex items-center gap-2 max-sm:w-full max-sm:[&_button]:flex-1">
        <FormFooterActions
          dirty
          editable
          anchorScope={anchorScope}
          formId={formId}
          placement="overlay"
          saving={saving}
          onRevert={onCancel}
        />
      </span>
    </div>
  );
}
