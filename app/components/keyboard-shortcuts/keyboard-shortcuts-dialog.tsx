"use client";

import type { Shortcut } from "@/components/keyboard/shortcut-registry";
import type { KeyboardShortcutsStore } from "./keyboard-shortcuts.store";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { ShortcutKeys, useKeyboardPlatform } from "@/components/keyboard/shortcut-keys";
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  isSingleKeyShortcut,
  shortcutKeyLabels,
} from "@/components/keyboard/shortcut-registry";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";

function shortcutAvailable(entry: Shortcut, store: KeyboardShortcutsStore, agentChatAvailable: boolean) {
  if (entry.id === "askMate") return agentChatAvailable;
  if (entry.id === "goList") return store.destinations.lists.length > 0;
  if (entry.destination) return store.destinations.pages[entry.destination] !== undefined;
  return true;
}

export const KeyboardShortcutsSingleKeySwitch = observer(({ id }: { id: string }) => {
  const t = useTranslations();
  const { keyboardShortcutsStore: store } = useRootStore();

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={id}>{t("KeyboardShortcuts.singleKey.label")}</Label>

        <p className="text-xs text-muted-foreground" id={`${id}-description`}>
          {t("KeyboardShortcuts.singleKey.description")}
        </p>
      </div>

      <Switch
        aria-describedby={`${id}-description`}
        checked={store.singleKeyShortcutsEnabled}
        id={id}
        onCheckedChange={(enabled) => runUserAction(() => store.setSingleKeyShortcuts(enabled))}
      />
    </div>
  );
});

export const KeyboardShortcutsDialog = observer(() => {
  const t = useTranslations();
  const platform = useKeyboardPlatform();
  const { keyboardShortcutsStore: store, agentChatEnabled, agentChatStore } = useRootStore();
  const agentChatAvailable = agentChatEnabled && agentChatStore.enabled === true;
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!store.isOpen) setQuery("");
  }, [store.isOpen]);
  const needle = query.trim().toLocaleLowerCase();
  const matches = (entry: Shortcut) =>
    !needle ||
    [t(`KeyboardShortcuts.actions.${entry.id}`), ...shortcutKeyLabels(entry.id, platform)].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    );
  const groups = SHORTCUT_GROUPS.map((group) => ({
    group,
    entries: SHORTCUTS.filter(
      (entry) => entry.group === group && shortcutAvailable(entry, store, agentChatAvailable) && matches(entry),
    ),
  })).filter(({ entries }) => entries.length > 0);

  return (
    <AppModal size="xl" store={store} title={t("KeyboardShortcuts.title")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("KeyboardShortcuts.title")}</h2>
        </AppCardHeader>

        <AppCardBody className="gap-5">
          <Input
            aria-label={t("KeyboardShortcuts.searchLabel")}
            placeholder={t("KeyboardShortcuts.searchPlaceholder")}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />

          {groups.length === 0 && <p className="text-sm text-muted-foreground">{t("KeyboardShortcuts.noMatches")}</p>}

          <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {groups.map(({ group, entries }) => (
              <section key={group} aria-labelledby={`keyboard-shortcuts-${group}`} className="flex flex-col gap-1">
                <h3 className="text-xs font-medium text-muted-foreground" id={`keyboard-shortcuts-${group}`}>
                  {t(`KeyboardShortcuts.groups.${group}`)}
                </h3>

                <ul className="flex flex-col">
                  {entries.map((entry) => {
                    const off = isSingleKeyShortcut(entry) && !store.singleKeyShortcutsEnabled;

                    return (
                      <li
                        key={entry.id}
                        className={cn("flex min-h-8 items-center justify-between gap-4 text-sm", off && "opacity-50")}
                        data-shortcut-row={entry.id}
                      >
                        <span className="min-w-0">{t(`KeyboardShortcuts.actions.${entry.id}`)}</span>

                        <ShortcutKeys id={entry.id} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="border-t border-border pt-4">
            <KeyboardShortcutsSingleKeySwitch id="keyboard-shortcuts-single-key" />
          </div>
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
