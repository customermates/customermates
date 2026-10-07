"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { chordMatches, detectKeyboardPlatform, singleKeyShortcutBlocked } from "@/components/keyboard/key-matching";
import {
  GO_PREFIX,
  SHORTCUT_SEQUENCE_TIMEOUT_MS,
  goSequenceTarget,
  matchesShortcut,
} from "@/components/keyboard/shortcut-registry";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useRouter } from "@/i18n/navigation";
import { stripLocalePrefix } from "@/i18n/locale-registry";

const PENDING_GO_TOAST_ID = "keyboard-shortcut-pending-go";
const PENDING_GO_HINT_DELAY_MS = 300;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"]);

function focusOrigin(): HTMLElement {
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : document.body;
}

export function GlobalKeyboardShortcuts() {
  const rootStore = useRootStore();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations();

  useEffect(() => {
    const {
      keyboardShortcutsStore: store,
      globalSearchModalStore,
      addPickerStore,
      viewPickerStore,
      navigationGuard,
    } = rootStore;
    const platform = detectKeyboardPlatform(navigator);
    let goTimer: ReturnType<typeof setTimeout> | undefined;
    let hintTimer: ReturnType<typeof setTimeout> | undefined;
    let pendingGo = false;

    const routeReady = () => rootStore.recordWorkspaceStore.routeReady(stripLocalePrefix(pathname));

    function endGo() {
      clearTimeout(goTimer);
      clearTimeout(hintTimer);
      toast.dismiss(PENDING_GO_TOAST_ID);
      pendingGo = false;
    }

    function startGo() {
      endGo();
      pendingGo = true;
      goTimer = setTimeout(endGo, SHORTCUT_SEQUENCE_TIMEOUT_MS);
      hintTimer = setTimeout(
        () =>
          toast(t("KeyboardShortcuts.pendingGo"), {
            id: PENDING_GO_TOAST_ID,
            duration: SHORTCUT_SEQUENCE_TIMEOUT_MS - PENDING_GO_HINT_DELAY_MS,
          }),
        PENDING_GO_HINT_DELAY_MS,
      );
    }

    function goTargetHref(event: KeyboardEvent) {
      const target = goSequenceTarget(event, platform);
      if (!target) return undefined;
      return "destination" in target
        ? store.destinations.pages[target.destination]
        : store.destinations.lists[target.listPosition];
    }

    function handleModifiedKey(event: KeyboardEvent) {
      if (!routeReady()) return;

      if (matchesShortcut(event, "search", platform)) {
        event.preventDefault();
        globalSearchModalStore.openFrom(focusOrigin());
        return;
      }

      if (
        matchesShortcut(event, "askMate", platform) &&
        rootStore.agentChatEnabled &&
        rootStore.agentChatStore.enabled === true
      ) {
        event.preventDefault();
        rootStore.agentChatStore.toggle();
      }
    }

    function handleSingleKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || MODIFIER_KEYS.has(event.key)) return;
      if (!store.singleKeyShortcutsEnabled) {
        if (pendingGo) endGo();
        return;
      }

      const continuesGo = pendingGo;
      if (continuesGo) endGo();
      if (!routeReady() || singleKeyShortcutBlocked(event, document)) return;

      if (continuesGo) {
        const href = goTargetHref(event);
        if (!href) return;
        event.preventDefault();
        navigationGuard.tryNavigate(() => router.push(href));
        return;
      }

      if (matchesShortcut(event, "add", platform)) {
        event.preventDefault();
        addPickerStore.openFrom(focusOrigin());
        return;
      }

      if (matchesShortcut(event, "searchAlias", platform)) {
        event.preventDefault();
        globalSearchModalStore.openFrom(focusOrigin());
        return;
      }

      if (matchesShortcut(event, "switchView", platform) && viewPickerStore.surface) {
        event.preventDefault();
        viewPickerStore.openFrom(focusOrigin());
        return;
      }

      if (matchesShortcut(event, "shortcuts", platform)) {
        event.preventDefault();
        store.openFrom(focusOrigin());
        return;
      }

      if (chordMatches(event, GO_PREFIX, platform)) {
        event.preventDefault();
        startGo();
      }
    }

    document.addEventListener("keydown", handleModifiedKey, true);
    document.addEventListener("keydown", handleSingleKey);

    return () => {
      document.removeEventListener("keydown", handleModifiedKey, true);
      document.removeEventListener("keydown", handleSingleKey);
      endGo();
    };
  }, [rootStore, router, pathname, t]);

  return null;
}
