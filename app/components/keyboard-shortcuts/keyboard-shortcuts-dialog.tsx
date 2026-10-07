"use client";

import type { Shortcut } from "@/components/keyboard/shortcut-registry";
import type { KeyboardShortcutsStore } from "./keyboard-shortcuts.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { SHORTCUTS, SHORTCUT_GROUPS, isSingleKeyShortcut } from "@/components/keyboard/shortcut-registry";
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
  const { keyboardShortcutsStore: store, agentChatEnabled, agentChatStore } = useRootStore();
  const agentChatAvailable = agentChatEnabled && agentChatStore.enabled === true;

  return (
    <AppModal size="lg" store={store} title={t("KeyboardShortcuts.title")}>
      <AppCard>
        <AppCardHeader>
          <h2 className="text-x-lg grow">{t("KeyboardShortcuts.title")}</h2>
        </AppCardHeader>

        <AppCardBody className="gap-6">
          <KeyboardShortcutsSingleKeySwitch id="keyboard-shortcuts-single-key" />

          {SHORTCUT_GROUPS.map((group) => {
            const entries = SHORTCUTS.filter(
              (entry) => entry.group === group && shortcutAvailable(entry, store, agentChatAvailable),
            );
            if (entries.length === 0) return null;

            return (
              <section key={group} aria-labelledby={`keyboard-shortcuts-${group}`} className="flex flex-col gap-1">
                <h3
                  className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  id={`keyboard-shortcuts-${group}`}
                >
                  {t(`KeyboardShortcuts.groups.${group}`)}
                </h3>

                <ul className="flex flex-col">
                  {entries.map((entry) => {
                    const off = isSingleKeyShortcut(entry) && !store.singleKeyShortcutsEnabled;

                    return (
                      <li
                        key={entry.id}
                        className={cn("flex min-h-9 items-center justify-between gap-4 text-sm", off && "opacity-50")}
                        data-shortcut-row={entry.id}
                      >
                        <span className="min-w-0">{t(`KeyboardShortcuts.actions.${entry.id}`)}</span>

                        <ShortcutKeys id={entry.id} />
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
});
