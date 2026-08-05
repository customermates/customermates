"use client";

import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Briefcase, Building2, CornerDownLeft, Loader2, Package, Search, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { EntityType } from "@/generated/prisma";

import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/entity-detail/hooks/use-entity-drawer-stack";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { AppCard } from "@/components/card/app-card";
import { AppModal } from "@/components/modal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/core/utils/cn";
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

  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => globalSearchModalStore.setWithUnsavedChangesGuard(false), []);

  useEffect(() => {
    if (!isOpen || !inputRef.current || document.activeElement === inputRef.current) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [isOpen, results]);

  const searchTerm = globalSearchModalStore.form.searchTerm ?? "";
  const hasQuery = debouncedSearchTerm.trim().length > 0;
  const showNoResults = hasQuery && !isLoading && results?.results.length === 0;

  const openItem = (item: GlobalSearchResultItem) => {
    globalSearchModalStore.pushRecentItem(item);
    globalSearchModalStore.close();
    openEntity(TYPE_META[item.type].entityType, item.id);
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

  const flatItems = useMemo(() => groupedResults.flatMap((g) => g.items), [groupedResults]);

  useEffect(() => setSelectedIndex(0), [flatItems.length]);

  useEffect(() => {
    if (isOpen) setSelectedIndex(0);
  }, [isOpen]);

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      globalSearchModalStore.close();
      return;
    }

    if (!flatItems.length) return;

    if (event.key === "ArrowDown" || event.key === "Tab") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % flatItems.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + flatItems.length) % flatItems.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      flatItems[selectedIndex]?.onSelect();
    }
  }

  return (
    <AppModal store={globalSearchModalStore} title={t("GlobalSearch.placeholder")}>
      <AppCard>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Icon
            className={cn("text-muted-foreground shrink-0", isLoading && "animate-spin")}
            icon={isLoading ? Loader2 : Search}
            size="lg"
          />

          {isLoading && <span className="sr-only">{t("GlobalSearch.loading")}</span>}

          <Input
            ref={inputRef}
            autoFocus
            className="border-0 bg-transparent shadow-none px-0 focus-visible:ring-0 focus-visible:border-transparent"
            id="global-search-input"
            placeholder={t("GlobalSearch.placeholder")}
            value={searchTerm}
            onChange={(e) => globalSearchModalStore.onChange("searchTerm", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {showNoResults ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t("GlobalSearch.noResults")}</p>
          ) : !hasQuery && recentItems.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">{t("GlobalSearch.emptyPrompt")}</p>
          ) : (
            <div className="flex flex-col">
              {groupedResults.map((group, groupIdx) => {
                const offset = groupedResults.slice(0, groupIdx).reduce((sum, g) => sum + g.items.length, 0);
                const heading = !hasQuery ? t("GlobalSearch.groupRecent") : plural(TYPE_META[group.type].entityType);

                return (
                  <div key={hasQuery ? group.type : "recent"} className="flex flex-col px-2 pb-1">
                    <div className="flex items-center justify-between px-2 pt-2 pb-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {heading}
                      </span>

                      {!hasQuery && groupIdx === 0 ? (
                        <button
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          type="button"
                          onClick={() => globalSearchModalStore.clearRecentItems()}
                        >
                          {t("GlobalSearch.clearRecent")}
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col">
                      {group.items.map((item, idx) => (
                        <ResultRow
                          key={`${item.type}-${item.id}`}
                          fallbackIcon={TYPE_META[item.type].icon}
                          label={item.name}
                          pictureUrl={item.pictureUrl}
                          selected={selectedIndex === offset + idx}
                          typeLabel={singular(TYPE_META[item.type].entityType)}
                          onMouseEnter={() => setSelectedIndex(offset + idx)}
                          onSelect={item.onSelect}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {flatItems.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            <Hint label={t("GlobalSearch.hintNavigate")} symbol="↑↓" />

            <Hint label={t("GlobalSearch.hintOpen")} symbol={<CornerDownLeft className="size-3" />} />
          </div>
        )}
      </AppCard>
    </AppModal>
  );
});

function ResultRow({
  fallbackIcon,
  pictureUrl,
  label,
  typeLabel,
  selected,
  onSelect,
  onMouseEnter,
}: {
  fallbackIcon: LucideIcon;
  pictureUrl: string | null;
  label: string;
  typeLabel: string;
  selected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const FallbackIcon = fallbackIcon;
  return (
    <button
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
      )}
      type="button"
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <Avatar>
        {pictureUrl && <AvatarImage src={pictureUrl} />}

        <AvatarFallback className="bg-transparent">
          {pictureUrl ? initialsFor(label) : <FallbackIcon className="text-muted-foreground size-4" />}
        </AvatarFallback>
      </Avatar>

      <span className="flex-1 min-w-0 truncate">{label}</span>

      <span className="text-[11px] text-muted-foreground shrink-0">{typeLabel}</span>
    </button>
  );
}

function Hint({ label, symbol }: { label: string; symbol: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-border bg-muted text-[10px] font-medium text-muted-foreground">
        {symbol}
      </kbd>

      <span>{label}</span>
    </div>
  );
}
