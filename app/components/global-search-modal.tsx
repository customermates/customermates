"use client";

import { recordSearchKey, recordSearchLabel, type RecordSearchHit } from "@/features/records/record-search.schema";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { ArrowRight, CornerDownLeft, Layers, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Kbd, ShortcutKeys } from "@/components/keyboard/shortcut-keys";
import { SHORTCUTS, type ShortcutId } from "@/components/keyboard/shortcut-registry";
import { useRouter } from "@/i18n/navigation";
import { useRootStore } from "@/core/stores/root-store.provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { initialsFor } from "@/core/utils/initials";
import { runUserAction } from "@/core/errors/report-application-error";

type SelectableItem = RecordSearchHit & { onSelect: () => void };

type PaletteCommand = {
  value: string;
  label: string;
  icon: LucideIcon;
  shortcut?: ShortcutId;
  onSelect: () => void;
};

const PAGE_SHORTCUTS = SHORTCUTS.filter((entry) => entry.destination !== undefined);

export const GlobalSearchModal = observer(() => {
  const t = useTranslations();
  const {
    addPickerStore,
    agentChatEnabled,
    agentChatStore,
    globalSearchModalStore,
    keyboardShortcutsStore,
    navigationGuard,
    recordWorkspaceStore,
    viewPickerStore,
  } = useRootStore();
  const router = useRouter();
  const { isOpen, debouncedSearchTerm, isLoading, results, recentItems } = globalSearchModalStore;
  const [selectedValue, setSelectedValue] = useState("");

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  const searchTerm = globalSearchModalStore.form.searchTerm ?? "";
  const hasQuery = debouncedSearchTerm.trim().length > 0;
  const showNoResults = hasQuery && !isLoading && results?.results.length === 0;

  const query = searchTerm.trim();
  const mateAvailable = agentChatEnabled && agentChatStore.enabled === true;
  const matchesQuery = (label: string) => !query || label.toLocaleLowerCase().includes(query.toLocaleLowerCase());

  const closeThen = (action: (focusReturnTarget: HTMLElement | null) => void) => {
    const focusReturnTarget = globalSearchModalStore.focusReturnTarget;
    globalSearchModalStore.close();
    action(focusReturnTarget);
  };

  const askMate = () =>
    closeThen(() => {
      if (!query) {
        agentChatStore.open();
        return;
      }
      agentChatStore.openWithDraft(query);
      agentChatStore.submitDraft();
    });

  const viewCommands: PaletteCommand[] = (viewPickerStore.surface?.options() ?? [])
    .filter((option) => matchesQuery(option.name))
    .map((option) => ({
      value: `palette-view-${option.id}`,
      label: option.name,
      icon: Layers,
      onSelect: () => closeThen(() => viewPickerStore.surface?.select(option.id)),
    }));

  const navigationCommands: PaletteCommand[] = PAGE_SHORTCUTS.flatMap((entry) => {
    const href = entry.destination ? keyboardShortcutsStore.destinations.pages[entry.destination] : undefined;
    const label = t(`KeyboardShortcuts.actions.${entry.id}`);
    if (!href || !matchesQuery(label)) return [];
    return [
      {
        value: `palette-go-${entry.id}`,
        label,
        icon: ArrowRight,
        shortcut: entry.id,
        onSelect: () => closeThen(() => navigationGuard.tryNavigate(() => router.push(href))),
      },
    ];
  });

  const addLabel = t("KeyboardShortcuts.actions.add");
  const createCommands: PaletteCommand[] = matchesQuery(addLabel)
    ? [
        {
          value: "palette-add",
          label: addLabel,
          icon: Plus,
          shortcut: "add",
          onSelect: () => closeThen((target) => addPickerStore.openFrom(target ?? document.body)),
        },
      ]
    : [];

  const commandGroups = [
    { key: "views", heading: t("DataView.views.pickerTitle"), commands: viewCommands },
    { key: "navigation", heading: t("KeyboardShortcuts.groups.navigation"), commands: navigationCommands },
    { key: "create", heading: t("KeyboardShortcuts.groups.create"), commands: createCommands },
  ].filter((group) => group.commands.length > 0);

  const openItem = (item: RecordSearchHit) => {
    const focusReturnTarget = globalSearchModalStore.focusReturnTarget;
    const focusReturnFallback = globalSearchModalStore.focusReturnFallback;
    globalSearchModalStore.pushRecentItem(item);
    globalSearchModalStore.close();
    recordWorkspaceStore.open(item.ref, focusReturnTarget, focusReturnFallback);
  };

  const openRecentItem = (item: RecordSearchHit) => {
    runUserAction(() =>
      globalSearchModalStore.verifyRecentItem(item).then((exists) => {
        if (exists) openItem(item);
      }),
    );
  };

  const groupedResults = useMemo((): { typeId: string; label: string; items: SelectableItem[] }[] => {
    const source = hasQuery ? (results?.results ?? []) : recentItems;
    if (!source.length) return [];
    if (!hasQuery) {
      return [
        {
          typeId: "recent",
          label: t("GlobalSearch.groupRecent"),
          items: source.map((item) => ({ ...item, onSelect: () => openRecentItem(item) })),
        },
      ];
    }
    const groups = new Map<string, { typeId: string; label: string; items: SelectableItem[] }>();
    for (const item of source) {
      const group = groups.get(item.ref.typeId) ?? { typeId: item.ref.typeId, label: item.typePluralLabel, items: [] };
      group.items.push({ ...item, onSelect: () => openItem(item) });
      groups.set(item.ref.typeId, group);
    }
    return [...groups.values()];
  }, [results, recentItems, hasQuery, globalSearchModalStore, recordWorkspaceStore, t]);

  const hasItems = groupedResults.some((group) => group.items.length > 0) || commandGroups.length > 0;
  const firstItem = groupedResults[0]?.items[0];
  const firstValue = firstItem ? recordSearchKey(firstItem) : (commandGroups[0]?.commands[0]?.value ?? "");

  useEffect(
    () => setSelectedValue((current) => (isOpen && current ? firstValue : "")),
    [firstValue, results, recentItems, isOpen],
  );

  return (
    <CommandDialog
      commandProps={{ shouldFilter: false, value: selectedValue, onValueChange: setSelectedValue }}
      description={t("GlobalSearch.placeholder")}
      focusReturnFallback={globalSearchModalStore.focusReturnFallback}
      focusReturnTarget={globalSearchModalStore.focusReturnTarget}
      open={isOpen}
      title={t("GlobalSearch.placeholder")}
      onOpenChange={(next) => {
        if (!next) globalSearchModalStore.close();
      }}
    >
      <div className="shrink-0" id="global-search-input">
        <CommandInput
          placeholder={t("GlobalSearch.placeholder")}
          value={searchTerm}
          onKeyDown={(event) => {
            if (event.key !== "Tab" || event.shiftKey || !query || !mateAvailable) return;
            event.preventDefault();
            askMate();
          }}
          onValueChange={(next) => globalSearchModalStore.onChange("searchTerm", next)}
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />

          <span>{t("GlobalSearch.loading")}</span>
        </div>
      )}

      <CommandList>
        {mateAvailable && (
          <CommandGroup>
            <CommandItem className="gap-3" value="palette-ask-mate" onSelect={askMate}>
              <Sparkles className="size-4 shrink-0 text-muted-foreground" />

              <span className="min-w-0 flex-1 truncate">
                {query ? t("GlobalSearch.askMateWith", { question: query }) : t("AgentChat.askAi")}
              </span>

              {query ? <Kbd>Tab</Kbd> : <ShortcutKeys id="askMate" />}
            </CommandItem>
          </CommandGroup>
        )}

        {showNoResults && commandGroups.length === 0 && <CommandEmpty>{t("GlobalSearch.noResults")}</CommandEmpty>}

        {!hasQuery && recentItems.length === 0 && commandGroups.length === 0 && (
          <CommandEmpty className="px-8 py-12">
            <div className="mx-auto flex max-w-sm flex-col items-center gap-4 text-center">
              <div className="flex size-12 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground">
                <Search aria-hidden className="size-5" />
              </div>

              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium text-foreground">{t("GlobalSearch.emptyTitle")}</p>

                <p className="text-sm leading-6 text-muted-foreground">{t("GlobalSearch.emptyDescription")}</p>
              </div>
            </div>
          </CommandEmpty>
        )}

        {groupedResults.map((group, groupIdx) => (
          <CommandGroup key={group.typeId} heading={group.label}>
            {group.items.map((item) => (
              <ResultRow
                key={recordSearchKey(item)}
                fallbackIcon={recordTypeIcon(item.icon)}
                label={recordSearchLabel(item, t)}
                pictureUrl={item.pictureUrl}
                typeLabel={item.typeLabel}
                value={recordSearchKey(item)}
                onSelect={item.onSelect}
              />
            ))}

            {!hasQuery && groupIdx === 0 && (
              <CommandItem
                className="text-muted-foreground"
                value="global-search-clear-recent"
                onSelect={() => globalSearchModalStore.clearRecentItems()}
              >
                {t("Common.actions.clear")}
              </CommandItem>
            )}
          </CommandGroup>
        ))}

        {commandGroups.map((group) => (
          <CommandGroup key={group.key} heading={group.heading}>
            {group.commands.map((command) => (
              <CommandItem key={command.value} className="gap-3" value={command.value} onSelect={command.onSelect}>
                <command.icon className="size-4 shrink-0 text-muted-foreground" />

                <span className="min-w-0 flex-1 truncate">{command.label}</span>

                {command.shortcut && <ShortcutKeys id={command.shortcut} />}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}

        {hasQuery && results?.nextCursor && (
          <CommandGroup>
            <CommandItem
              disabled={globalSearchModalStore.isLoadingMore}
              value="global-search-more"
              onSelect={() => runUserAction(globalSearchModalStore.loadMore)}
            >
              {globalSearchModalStore.isLoadingMore ? t("GlobalSearch.loading") : t("Common.actions.loadMore")}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>

      {hasItems && (
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <Hint label={t("GlobalSearch.hintNavigate")} symbol="↑↓" />

          <Hint label={t("GlobalSearch.hintOpen")} symbol={<CornerDownLeft className="size-3" />} />

          {mateAvailable && query && <Hint label={t("GlobalSearch.hintAskMate")} symbol="Tab" />}
        </div>
      )}
    </CommandDialog>
  );
});

function ResultRow({
  fallbackIcon,
  pictureUrl,
  label,
  typeLabel,
  value,
  onSelect,
}: {
  fallbackIcon: LucideIcon;
  pictureUrl: string | null;
  label: string;
  typeLabel: string;
  value: string;
  onSelect: () => void;
}) {
  const FallbackIcon = fallbackIcon;
  return (
    <CommandItem className="gap-3" value={value} onSelect={onSelect}>
      <Avatar>
        {pictureUrl && <AvatarImage src={pictureUrl} />}

        <AvatarFallback className="bg-transparent">
          {pictureUrl ? initialsFor(label) : <FallbackIcon className="size-4 text-muted-foreground" />}
        </AvatarFallback>
      </Avatar>

      <span className="min-w-0 flex-1 truncate">{label}</span>

      <span className="shrink-0 text-[11px] text-muted-foreground">{typeLabel}</span>
    </CommandItem>
  );
}

function Hint({ label, symbol }: { label: string; symbol: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <Kbd>{symbol}</Kbd>

      <span>{label}</span>
    </div>
  );
}
