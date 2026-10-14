"use client";

import type { ShortcutId } from "./shortcut-registry";
import type { KeyboardPlatform } from "./key-matching";

import { Fragment, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";

import { cn } from "@/core/utils/cn";

import { detectKeyboardPlatform } from "./key-matching";
import { shortcutKeyLabels } from "./shortcut-registry";

const subscribe = () => () => undefined;
const clientPlatform = () => detectKeyboardPlatform(typeof navigator === "undefined" ? undefined : navigator);
const serverPlatform = (): KeyboardPlatform => "other";

export function useKeyboardPlatform(): KeyboardPlatform {
  return useSyncExternalStore(subscribe, clientPlatform, serverPlatform);
}

export function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function ShortcutKeys({ id, className }: { id: ShortcutId; className?: string }) {
  const t = useTranslations();
  const platform = useKeyboardPlatform();

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 pointer-coarse:hidden", className)} data-shortcut={id}>
      {shortcutKeyLabels(id, platform).map((label, index) => (
        <Fragment key={index}>
          {index > 0 && <span className="text-[11px] text-muted-foreground">{t("KeyboardShortcuts.then")}</span>}

          <Kbd>{label}</Kbd>
        </Fragment>
      ))}
    </span>
  );
}
