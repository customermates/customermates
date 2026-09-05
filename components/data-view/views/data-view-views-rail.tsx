"use client";

import type { MouseEvent, ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { ViewMetaDraft } from "./use-view-commands";

import { ChevronDownIcon, PlusIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { useSetTopBarJoinedContent } from "@/app/components/topbar-actions-context";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { VIEW_TAB_CLASS, ViewChip } from "./view-chip";
import { ViewMenuItems } from "./view-menu-items";
import { ViewMetaOverlay } from "./view-meta-overlay";
import { orderChips, sortViewsByPosition, viewMenuItems } from "./view-rail-model";
import { viewHref } from "./view-actions";
import { useRovingFocus } from "./use-roving-focus";
import { useViewCommands } from "./use-view-commands";

type Props<E extends HasId> = {
  joinsTopBar?: boolean;
  store: BaseDataViewStore<E>;
};

const CONTROL_CLASS = "size-7 shrink-0";

function isPlainClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

export const DataViewViewsRail = observer(function DataViewViewsRail<E extends HasId>({
  joinsTopBar = false,
  store,
}: Props<E>) {
  const t = useTranslations();
  const pathname = usePathname();
  const { appMode } = useRootStore();
  const [meta, setMeta] = useState<ViewMetaDraft | null>(null);
  const offersViews = Boolean(store.p13nId);

  const commands = useViewCommands({
    closeMeta: () => setMeta(null),
    openMeta: setMeta,
    pathname,
    store,
  });

  const chips = orderChips(store.views, store.activeViewKey);
  const activeView = store.views.find((view) => view.id === store.activeViewKey);
  const tabbableIndex = chips.findIndex((chip) => chip.isActive);
  const { onKeyDownAt, tabIndexAt } = useRovingFocus(chips.length, Math.max(tabbableIndex, 0));

  useSetTopBarJoinedContent(joinsTopBar && offersViews);

  if (!offersViews) return null;

  const canWriteViews = appMode !== "demo";
  const activeName = activeView?.name ?? t("DataView.views.all");
  const ordered = sortViewsByPosition(store.views);
  const isDrafting = meta !== null && meta.mode !== "edit";

  const previewFor = (name: string, isActive: boolean): ReactNode => (
    <>
      <span className="block font-medium">{name}</span>

      {isActive && (
        <span className="block text-[11px] text-muted-foreground">
          {t("DataView.views.recordCount", { count: store.pagination?.total ?? 0 })}
        </span>
      )}
    </>
  );

  const onChipClick = (viewKey: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;

    event.preventDefault();
    commands.select(viewKey);
  };

  return (
    <nav
      aria-label={t("DataView.views.railLabel")}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b border-border bg-background px-4 ps-[calc(1rem+var(--safe-left,0px))] pe-[calc(1rem+var(--safe-right,0px))]",
        store.hasSelection && store.entityType && "hidden md:flex",
      )}
      data-data-view-rail=""
      id="global-data-views"
    >
      <TooltipProvider>
        <OverflowRail
          ariaLabel={t("DataView.views.railLabel")}
          bleed={false}
          className="min-w-0 flex-1"
          focusable={false}
          observedKey={chips.length}
          railClassName="items-center gap-1 py-2"
          railProps={{
            "aria-label": t("DataView.views.railLabel"),
            "aria-orientation": "horizontal",
            "data-data-view-rail-items": "",
            role: "toolbar",
          }}
        >
          {!store.isReady &&
            [0, 1, 2].map((index) => <Skeleton key={index} className="h-7 w-20 shrink-0 rounded-md" />)}

          {store.isReady &&
            chips.map((chip, index) => {
              if (chip.kind === "all") {
                return (
                  <ViewChip
                    key={ALL_VIEW_KEY}
                    href={viewHref(pathname, ALL_VIEW_KEY)}
                    id="global-data-views-all"
                    isActive={chip.isActive}
                    label={t("DataView.views.all")}
                    preview={previewFor(t("DataView.views.all"), chip.isActive)}
                    tabIndex={tabIndexAt(index)}
                    onKeyDown={onKeyDownAt(index)}
                    onSelect={onChipClick(ALL_VIEW_KEY)}
                  />
                );
              }

              return (
                <ViewChip
                  key={chip.view.id}
                  href={viewHref(pathname, chip.view.id)}
                  isActive={chip.isActive}
                  label={chip.view.name}
                  preview={previewFor(chip.view.name, chip.isActive)}
                  tabIndex={tabIndexAt(index)}
                  onKeyDown={onKeyDownAt(index)}
                  onSelect={onChipClick(chip.view.id)}
                />
              );
            })}

          {isDrafting && (
            <span
              aria-hidden
              className={cn(VIEW_TAB_CLASS, "border border-dashed border-border text-muted-foreground")}
              data-view-draft=""
            >
              <span className="truncate">{t("DataView.views.createTitle")}</span>
            </span>
          )}

          {store.isReady && canWriteViews && (
            <ViewMetaOverlay
              mode={meta?.mode ?? "create"}
              name={meta?.name ?? ""}
              open={meta !== null}
              trigger={
                <Button
                  aria-label={t("DataView.views.createTitle")}
                  className={CONTROL_CLASS}
                  id="global-data-views-new"
                  size="icon-xs"
                  variant="ghost"
                >
                  <PlusIcon aria-hidden />
                </Button>
              }
              onChange={(draft) => setMeta((current) => (current ? { ...current, ...draft } : current))}
              onOpenChange={(next) => setMeta(next ? { mode: "create", name: "" } : null)}
              onSubmit={(values) => (meta ? commands.submitMeta(meta, values) : Promise.resolve())}
            />
          )}
        </OverflowRail>
      </TooltipProvider>

      {store.isReady && canWriteViews && activeView && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("DataView.views.menu")}
              className={CONTROL_CLASS}
              id="global-data-views-menu"
              size="icon-xs"
              variant="ghost"
            >
              <ChevronDownIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <ViewMenuItems
              commands={commands}
              items={viewMenuItems({
                index: ordered.findIndex((candidate) => candidate.id === activeView.id),
                total: ordered.length,
              })}
              view={activeView}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <span aria-live="polite" className="sr-only">
        {t("DataView.views.applied", { name: activeName })}
      </span>
    </nav>
  );
});
