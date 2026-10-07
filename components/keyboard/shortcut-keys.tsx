"use client";

import type { ShortcutId } from "./shortcut-registry";
import type { KeyboardPlatform } from "./key-matching";

import { useSyncExternalStore } from "react";

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
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center rounded border border-current/20 bg-current/5 px-1.5 font-sans text-[11px] font-medium opacity-70",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function ShortcutKeys({ id, className }: { id: ShortcutId; className?: string }) {
  const platform = useKeyboardPlatform();

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 pointer-coarse:hidden", className)} data-shortcut={id}>
      {shortcutKeyLabels(id, platform).map((label, index) => (
        <Kbd key={index}>{label}</Kbd>
      ))}
    </span>
  );
}
