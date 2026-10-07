"use client";

import { recordSearchKey, recordSearchLabel, type RecordSearchHit } from "@/features/records/record-search.schema";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CornerDownLeft, Loader2, Search } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";

import { Kbd } from "@/components/keyboard/shortcut-keys";
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

export const GlobalSearchModal = observer(() => {
  const t = useTranslations();
  const { globalSearchModalStore, recordWorkspaceStore } = useRootStore();
  const { isOpen, debouncedSearchTerm, isLoading, results, recentItems } = globalSearchModalStore;
  const [selectedValue, setSelectedValue] = useState("");

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  const searchTerm = globalSearchModalStore.form.searchTerm ?? "";
  const hasQuery = debouncedSearchTerm.trim().length > 0;
  const showNoResults = hasQuery && !isLoading && results?.results.length === 0;

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

  const hasItems = groupedResults.some((group) => group.items.length > 0);
  const firstItem = groupedResults[0]?.items[0];
  const firstValue = firstItem ? recordSearchKey(firstItem) : "";

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
        {showNoResults && <CommandEmpty>{t("GlobalSearch.noResults")}</CommandEmpty>}

        {!hasQuery && recentItems.length === 0 && (
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
                {t("GlobalSearch.clearRecent")}
              </CommandItem>
            )}
          </CommandGroup>
        ))}

        {hasQuery && results?.nextCursor && (
          <CommandGroup>
            <CommandItem
              disabled={globalSearchModalStore.isLoadingMore}
              value="global-search-more"
              onSelect={() => runUserAction(globalSearchModalStore.loadMore)}
            >
              {globalSearchModalStore.isLoadingMore ? t("GlobalSearch.loading") : t("GlobalSearch.loadMore")}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>

      {hasItems && (
        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <Hint label={t("GlobalSearch.hintNavigate")} symbol="↑↓" />

          <Hint label={t("GlobalSearch.hintOpen")} symbol={<CornerDownLeft className="size-3" />} />
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
