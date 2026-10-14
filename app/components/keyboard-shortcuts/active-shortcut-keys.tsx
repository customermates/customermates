"use client";

import type { ShortcutId } from "@/components/keyboard/shortcut-registry";

import { observer } from "mobx-react-lite";

import { ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { isSingleKeyShortcut, shortcut } from "@/components/keyboard/shortcut-registry";
import { useRootStore } from "@/core/stores/root-store.provider";

export const ActiveShortcutKeys = observer(({ id, className }: { id: ShortcutId; className?: string }) => {
  const { keyboardShortcutsStore } = useRootStore();
  if (isSingleKeyShortcut(shortcut(id)) && !keyboardShortcutsStore.singleKeyShortcutsEnabled) return null;

  return <ShortcutKeys className={className} id={id} />;
});
