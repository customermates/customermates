"use client";

import type { RefObject } from "react";

import { useEffect } from "react";

import { useOverlayDismissGuard } from "@/components/modal/overlay-dismiss-guard";

const SHORTCUT_SCOPE =
  "form, [data-slot='popover-content'], [data-slot='drawer-content'], [data-slot='dialog-content'], [data-slot='sheet-content'], [data-uid='app-card']";

type Options = {
  enabled: boolean;
  containerRef: RefObject<HTMLElement | null>;
  saveButtonRef: RefObject<HTMLButtonElement | null>;
  formId?: string;
  interceptDismiss: () => boolean;
};

export function isSaveShortcut(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.isComposing) return false;
  return event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter";
}

export function shortcutScope(container: HTMLElement | null, formId: string | undefined) {
  const form = formId ? document.getElementById(formId) : null;
  return form ?? container?.closest<HTMLElement>(SHORTCUT_SCOPE) ?? null;
}

export function useFormFooterKeyboard({ enabled, containerRef, saveButtonRef, formId, interceptDismiss }: Options) {
  const dismissGuard = useOverlayDismissGuard();

  useEffect(() => {
    if (!enabled || !dismissGuard) return;
    dismissGuard.current = interceptDismiss;
    return () => {
      if (dismissGuard.current === interceptDismiss) dismissGuard.current = null;
    };
  });

  useEffect(() => {
    if (!enabled) return;
    const scope = shortcutScope(containerRef.current, formId);
    if (!scope) return;

    function onKeyDown(event: KeyboardEvent) {
      const button = saveButtonRef.current;
      if (event.defaultPrevented || !isSaveShortcut(event) || !button || button.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      button.click();
    }

    scope.addEventListener("keydown", onKeyDown, { capture: true });
    return () => scope.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [enabled, containerRef, saveButtonRef, formId]);
}
