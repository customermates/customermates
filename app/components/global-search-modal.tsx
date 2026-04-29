"use client";

import type { GlobalSearchResultItem } from "@/features/search/global-search.interactor";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Briefcase, Building2, CornerDownLeft, Loader2, Package, Search, Users } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EntityType } from "@/generated/prisma";

import { checkSearchResultExistsAction } from "@/app/[locale]/(protected)/search/actions";
import { useRootStore } from "@/core/stores/root-store.provider";
import { useOpenEntity } from "@/components/modal/hooks/use-entity-drawer-stack";
import { AppCard } from "@/components/card/app-card";
import { AppModal } from "@/components/modal";
import { Icon } from "@/components/shared/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TYPE_META: Record<
  GlobalSearchResultItem["type"],
  { icon: LucideIcon; entityType: EntityType; labelKey: string }
> = {
  contact: { icon: Users, entityType: EntityType.contact, labelKey: "groupContact" },
  organization: { icon: Building2, entityType: EntityType.organization, labelKey: "groupOrganization" },
  deal: { icon: Briefcase, entityType: EntityType.deal, labelKey: "groupDeal" },
  service: { icon: Package, entityType: EntityType.service, labelKey: "groupService" },
};

type SelectableItem = GlobalSearchResultItem & { onSelect: () => void };

export const GlobalSearchModal = observer(() => {
  const t = useTranslations("GlobalSearch");
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
    void (async () => {
      const exists = await checkSearchResultExistsAction({ type: item.type, id: item.id });
      if (!exists) {
        globalSearchModalStore.removeRecentItem(item.id);
        toast.error(t("staleItem"));
        return;
      }
      openItem(item);
    })();
  };

  const groupedResults = useMemo((): { type: GlobalSearchResultItem["type"]; items: SelectableItem[] }[] => {
    const source = hasQuery ? (results?.results ?? []) : recentItems;
    if (source.length === 0) return [];

    if (!hasQuery)
      return [{ type: "contact", items: source.map((item) => ({ ...item, onSelect: () => openRecentItem(item) })) }];

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
    <AppModal store={globalSearchModalStore} title={t("placeholder")}>
      <AppCard>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Icon
            className={cn("text-muted-foreground shrink-0", isLoading && "animate-spin")}
            icon={isLoading ? Loader2 : Search}
            size="lg"
          />

          {isLoading && <span className="sr-only">{t("loading")}</span>}

          <Input
            ref={inputRef}
            autoFocus
            className="border-0 bg-transparent shadow-none px-0 focus-visible:ring-0 focus-visible:border-transparent"
            id="searchTerm"
            placeholder={t("placeholder")}
            value={searchTerm}
            onChange={(e) => globalSearchModalStore.onChange("searchTerm", e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {showNoResults ? (
            <EmptyState>{t("noResults")}</EmptyState>
          ) : !hasQuery && recentItems.length === 0 ? (
            <EmptyState>{t("emptyPrompt")}</EmptyState>
          ) : (
            <div className="flex flex-col">
              {groupedResults.map((group, groupIdx) => {
                const offset = groupedResults.slice(0, groupIdx).reduce((sum, g) => sum + g.items.length, 0);
                const heading = !hasQuery ? t("groupRecent") : t(TYPE_META[group.type].labelKey);

                return (
                  <GroupSection
                    key={hasQuery ? group.type : "recent"}
                    action={
                      !hasQuery && groupIdx === 0 ? (
                        <button
                          className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                          type="button"
                          onClick={() => globalSearchModalStore.clearRecentItems()}
                        >
                          {t("clearRecent")}
                        </button>
                      ) : null
                    }
                    heading={heading}
                  >
                    {group.items.map((item, idx) => (
                      <ResultRow
                        key={`${item.type}-${item.id}`}
                        icon={TYPE_META[item.type].icon}
                        label={item.name}
                        selected={selectedIndex === offset + idx}
                        typeLabel={t(TYPE_META[item.type].labelKey)}
                        onMouseEnter={() => setSelectedIndex(offset + idx)}
                        onSelect={item.onSelect}
                      />
                    ))}
                  </GroupSection>
                );
              })}
            </div>
          )}
        </div>

        {flatItems.length > 0 && (
          <div className="flex items-center gap-4 px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
            <Hint label={t("hintNavigate")} symbol="↑↓" />

            <Hint label={t("hintOpen")} symbol={<CornerDownLeft className="size-3" />} />
          </div>
        )}
      </AppCard>
    </AppModal>
  );
});

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-6 py-10 text-center text-sm text-muted-foreground">{children}</p>;
}

function GroupSection({ heading, action, children }: { heading: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col px-2 pb-1">
      <div className="flex items-center justify-between px-2 pt-2 pb-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{heading}</span>

        {action}
      </div>

      <div className="flex flex-col">{children}</div>
    </div>
  );
}

function ResultRow({
  icon,
  label,
  typeLabel,
  selected,
  onSelect,
  onMouseEnter,
}: {
  icon: LucideIcon;
  label: string;
  typeLabel: string;
  selected: boolean;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
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
      <Icon className="text-muted-foreground shrink-0" icon={icon} />

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
