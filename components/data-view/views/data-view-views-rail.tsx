"use client";

import type { MouseEvent, ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { ViewMetaDraft } from "./use-view-commands";

import { ChevronDownIcon, CircleAlertIcon, MoreHorizontalIcon, PlusIcon, RotateCcwIcon, SaveIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";

import { useSetTopBarJoinedContent } from "@/app/components/topbar-actions-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OverflowRail } from "@/components/shared/overflow-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ALL_VIEW_KEY, isShareableSurface } from "@/core/data-view/data-view-keys";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";

import { ViewChip } from "./view-chip";
import { ViewMenuItems } from "./view-menu-items";
import { ViewMetaOverlay } from "./view-meta-overlay";
import { ViewPickerOverlay } from "./view-picker-overlay";
import { RAIL_HIT_AREA, isOrphanedView, orderChips, viewMenuItems } from "./view-rail-model";
import { ownedViewsInOrder, viewHref } from "./view-actions";
import { useRovingFocus } from "./use-roving-focus";
import { useViewCommands } from "./use-view-commands";

type Props<E extends HasId> = {
  joinsTopBar?: boolean;
  store: BaseDataViewStore<E>;
};

const CONTROL_CLASS = "h-[22px] px-2 text-[11px]";
const ICON_CONTROL_CLASS = "size-[22px]";

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
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const offersViews = Boolean(store.p13nId);

  const commands = useViewCommands({
    closeMeta: () => setMeta(null),
    openMeta: (draft) => {
      setIsPickerOpen(false);
      setMeta(draft);
    },
    pathname,
    store,
  });

  const orphaned = store.viewLost || isOrphanedView(store.views, store.activeViewKey);
  const { chips, hiddenCount } = orderChips(store.views, store.activeViewKey, store.viewIsDirty, orphaned);
  const linkChips = chips.filter((chip) => chip.kind !== "orphan");
  const activeView = orphaned ? undefined : store.views.find((view) => view.id === store.activeViewKey);
  const tabbableKey = activeView ? activeView.id : ALL_VIEW_KEY;
  const tabbableIndex = linkChips.findIndex(
    (chip) => (chip.kind === "all" ? ALL_VIEW_KEY : chip.view.id) === tabbableKey,
  );
  const { onKeyDownAt, tabIndexAt } = useRovingFocus(linkChips.length, Math.max(tabbableIndex, 0));

  useSetTopBarJoinedContent(joinsTopBar && offersViews);

  if (!offersViews) return null;

  const canWriteViews = appMode !== "demo";
  const canShareViews = canWriteViews && isShareableSurface(store.p13nId);
  const isDirty = orphaned || store.viewIsDirty;
  const canCommitToView = canWriteViews && Boolean(activeView?.isOwner);
  const activeName = orphaned ? t("DataView.views.unavailable") : (activeView?.name ?? t("DataView.views.all"));
  const owned = ownedViewsInOrder(store.views);
  const isDrafting = meta !== null && meta.mode !== "edit";

  const ownerLine = (view: DataViewChipDto): string | null => {
    if (!view.isOwner) return t("DataView.views.ownedBy", { name: view.ownerName ?? "" });
    return view.visibility === "workspace" ? t("DataView.views.shared") : null;
  };

  const previewFor = (name: string, owner: string | null, isActive: boolean): ReactNode => (
    <>
      <span className="block font-medium">{name}</span>

      {owner && <span className="block text-[11px] text-muted-foreground">{owner}</span>}

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
          railClassName="items-center gap-1.5 py-2.5"
          railProps={{
            "aria-label": t("DataView.views.railLabel"),
            "aria-orientation": "horizontal",
            "data-data-view-rail-items": "",
            role: "toolbar",
          }}
        >
          {!store.isReady &&
            [0, 1, 2].map((index) => <Skeleton key={index} className="h-[22px] w-20 shrink-0 rounded-md" />)}

          {store.isReady &&
            chips.map((chip) => {
              if (chip.kind === "orphan") {
                return (
                  <ViewChip
                    key="orphan"
                    isActive
                    isDirty
                    icon={CircleAlertIcon}
                    isShared={false}
                    label={t("DataView.views.unavailable")}
                    preview={t("DataView.views.unavailableBody")}
                    tabIndex={-1}
                    variant="outline"
                  />
                );
              }

              const viewKey = chip.kind === "all" ? ALL_VIEW_KEY : chip.view.id;
              const index = linkChips.indexOf(chip);

              if (chip.kind === "all") {
                return (
                  <ViewChip
                    key="all"
                    href={viewHref(pathname, ALL_VIEW_KEY)}
                    id="global-data-views-all"
                    isActive={chip.isActive}
                    isDirty={chip.isDirty}
                    isShared={false}
                    label={t("DataView.views.all")}
                    preview={previewFor(t("DataView.views.all"), null, chip.isActive)}
                    tabIndex={tabIndexAt(index)}
                    variant={chip.isActive ? "default" : "secondary"}
                    onKeyDown={onKeyDownAt(index)}
                    onSelect={onChipClick(viewKey)}
                  />
                );
              }

              return (
                <ViewChip
                  key={chip.view.id}
                  href={viewHref(pathname, chip.view.id)}
                  isActive={chip.isActive}
                  isDirty={chip.isDirty}
                  isShared={chip.view.visibility === "workspace"}
                  label={chip.view.name}
                  preview={previewFor(chip.view.name, ownerLine(chip.view), chip.isActive)}
                  tabIndex={tabIndexAt(index)}
                  variant={chip.isActive ? "default" : "secondary"}
                  onKeyDown={onKeyDownAt(index)}
                  onSelect={onChipClick(viewKey)}
                />
              );
            })}

          {isDrafting && (
            <Badge
              aria-hidden
              className="h-[22px] max-w-36 flex-none border-dashed px-1.5 sm:max-w-56"
              variant="outline"
            >
              <span className="truncate">{meta.name || t("DataView.views.createTitle")}</span>
            </Badge>
          )}
        </OverflowRail>
      </TooltipProvider>

      {store.isReady && (
        <div className="flex shrink-0 items-center gap-1.5">
          {isDirty && (
            <Button
              aria-label={t("Common.actions.reset")}
              className={cn(CONTROL_CLASS, RAIL_HIT_AREA)}
              id="global-data-views-reset"
              size="xs"
              variant="secondary"
              onClick={() => commands.reset()}
            >
              <RotateCcwIcon aria-hidden className="sm:hidden" />

              <span className="hidden sm:inline">{t("Common.actions.reset")}</span>
            </Button>
          )}

          {isDirty && canWriteViews && (
            <Button
              aria-label={canCommitToView ? t("DataView.views.saveChanges") : t("DataView.views.saveAsNew")}
              className={cn(CONTROL_CLASS, RAIL_HIT_AREA)}
              id="global-data-views-save"
              size="xs"
              variant="default"
              onClick={() => (canCommitToView && activeView ? commands.saveChanges(activeView) : commands.create())}
            >
              <SaveIcon aria-hidden className="sm:hidden" />

              <span className="hidden sm:inline">
                {canCommitToView ? t("Common.actions.save") : t("DataView.views.saveAsNew")}
              </span>
            </Button>
          )}

          {canWriteViews && activeView && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={t("DataView.views.menu")}
                  className={cn(ICON_CONTROL_CLASS, RAIL_HIT_AREA)}
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
                  items={viewMenuItems(activeView, {
                    canShareViews,
                    canWriteViews,
                    index: owned.findIndex((candidate) => candidate.id === activeView.id),
                    isDirty: store.viewIsDirty,
                    total: owned.length,
                  })}
                  view={activeView}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {(store.views.length > 0 || orphaned) && (
            <ViewPickerOverlay
              canShareViews={canShareViews}
              canWriteViews={canWriteViews}
              commands={commands}
              isOrphaned={orphaned}
              open={isPickerOpen}
              store={store}
              trigger={
                <Button
                  aria-label={t("DataView.views.pickerTitle")}
                  className={cn(hiddenCount > 0 ? CONTROL_CLASS : ICON_CONTROL_CLASS, RAIL_HIT_AREA)}
                  id="global-data-views-picker"
                  size={hiddenCount > 0 ? "xs" : "icon-xs"}
                  variant="ghost"
                >
                  {hiddenCount > 0 ? `+${hiddenCount}` : <MoreHorizontalIcon aria-hidden />}
                </Button>
              }
              onOpenChange={setIsPickerOpen}
            />
          )}

          {canWriteViews && (
            <ViewMetaOverlay
              canShareViews={canShareViews}
              isShared={meta?.isShared ?? false}
              mode={meta?.mode ?? "create"}
              name={meta?.name ?? ""}
              open={meta !== null}
              trigger={
                <Button
                  aria-label={t("DataView.views.createTitle")}
                  className={cn(ICON_CONTROL_CLASS, RAIL_HIT_AREA)}
                  id="global-data-views-new"
                  size="icon-xs"
                  variant="secondary"
                >
                  <PlusIcon aria-hidden />
                </Button>
              }
              onChange={(draft) => setMeta((current) => (current ? { ...current, ...draft } : current))}
              onOpenChange={(next) => setMeta(next ? { isShared: false, mode: "create", name: "" } : null)}
              onSubmit={(values) => (meta ? commands.submitMeta(meta, values) : Promise.resolve())}
            />
          )}
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {t("DataView.views.applied", { name: activeName })}
      </span>
    </nav>
  );
});
