"use client";

import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Briefcase, Building2, CornerDownLeft, Loader2, Package, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { EntityType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
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

const TYPE_META: Record<GlobalSearchResultItem["type"], { icon: LucideIcon; entityType: EntityType }> = {
  contact: { icon: Users, entityType: EntityType.contact },
  organization: { icon: Building2, entityType: EntityType.organization },
  deal: { icon: Briefcase, entityType: EntityType.deal },
  service: { icon: Package, entityType: EntityType.service },
};

type SelectableItem = GlobalSearchResultItem & { onSelect: () => void };

export const GlobalSearchModal = observer(() => {
  const t = useTranslations();
  const { plural, singular } = useEntityTerminology();
  const { globalSearchModalStore } = useRootStore();
  const openEntity = useOpenEntity();
  const { isOpen, debouncedSearchTerm, isLoading, results, recentItems } = globalSearchModalStore;

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  const searchTerm = globalSearchModalStore.form.searchTerm ?? "";
  const hasQuery = debouncedSearchTerm.trim().length > 0;
  const showNoResults = hasQuery && !isLoading && results?.results.length === 0;

  const openItem = (item: GlobalSearchResultItem) => {
    const focusReturnTarget = globalSearchModalStore.focusReturnTarget;
    const focusReturnFallback = globalSearchModalStore.focusReturnFallback;
    globalSearchModalStore.pushRecentItem(item);
    globalSearchModalStore.close();
    openEntity(TYPE_META[item.type].entityType, item.id, focusReturnTarget, focusReturnFallback);
  };

  const openRecentItem = (item: GlobalSearchResultItem) => {
    void globalSearchModalStore.verifyRecentItem(item).then((exists) => {
      if (exists) openItem(item);
    });
  };

  const groupedResults = useMemo((): {
    type: GlobalSearchResultItem["type"];
    items: SelectableItem[];
  }[] => {
    const source = hasQuery ? (results?.results ?? []) : recentItems;
    if (source.length === 0) return [];

    if (!hasQuery) {
      return [
        {
          type: "contact",
          items: source.map((item) => ({
            ...item,
            onSelect: () => openRecentItem(item),
          })),
        },
      ];
    }

    const buckets: Record<GlobalSearchResultItem["type"], SelectableItem[]> = {
      contact: [],
      organization: [],
      deal: [],
      service: [],
    };
    for (const item of source) buckets[item.type].push({ ...item, onSelect: () => openItem(item) });
    return (Object.keys(buckets) as GlobalSearchResultItem["type"][])
      .map((type) => ({ type, items: buckets[type] }))
      .filter((g) => g.items.length > 0);
  }, [results, recentItems, hasQuery, globalSearchModalStore, openEntity, t]);

  const hasItems = groupedResults.some((group) => group.items.length > 0);

  return (
    <CommandDialog
      commandProps={{ shouldFilter: false }}
      description={t("GlobalSearch.placeholder")}
      focusReturnFallback={globalSearchModalStore.focusReturnFallback}
      focusReturnTarget={globalSearchModalStore.focusReturnTarget}
      open={isOpen}
      title={t("GlobalSearch.placeholder")}
      onOpenChange={(next) => {
        if (!next) globalSearchModalStore.close();
      }}
    >
      <CommandInput
        id="global-search-input"
        placeholder={t("GlobalSearch.placeholder")}
        value={searchTerm}
        onValueChange={(next) => globalSearchModalStore.onChange("searchTerm", next)}
      />

      {isLoading && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 shrink-0 animate-spin" />

          <span>{t("GlobalSearch.loading")}</span>
        </div>
      )}

      <CommandList>
        {showNoResults && <CommandEmpty>{t("GlobalSearch.noResults")}</CommandEmpty>}

        {!hasQuery && recentItems.length === 0 && (
          <CommandEmpty>
            {t("GlobalSearch.emptyPrompt", {
              contacts: plural(EntityType.contact),
              deals: plural(EntityType.deal),
              organizations: plural(EntityType.organization),
              services: plural(EntityType.service),
            })}
          </CommandEmpty>
        )}

        {groupedResults.map((group, groupIdx) => (
          <CommandGroup
            key={hasQuery ? group.type : "recent"}
            heading={!hasQuery ? t("GlobalSearch.groupRecent") : plural(TYPE_META[group.type].entityType)}
          >
            {group.items.map((item) => (
              <ResultRow
                key={`${item.type}-${item.id}`}
                fallbackIcon={TYPE_META[item.type].icon}
                label={item.name}
                pictureUrl={item.pictureUrl}
                typeLabel={singular(TYPE_META[item.type].entityType)}
                value={`${item.type}-${item.id}`}
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
      <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-medium text-muted-foreground">
        {symbol}
      </kbd>

      <span>{label}</span>
    </div>
  );
}
