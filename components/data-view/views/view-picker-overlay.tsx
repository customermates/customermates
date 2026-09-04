"use client";

import type { ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { ViewCommands } from "./use-view-commands";

import { MoreHorizontalIcon, PlusIcon, UsersIcon } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ResponsiveOverlay } from "@/components/modal/responsive-overlay";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import { ViewMenuItems } from "./view-menu-items";
import { ownedViewsInOrder } from "./view-actions";
import { sortViewsByPosition, viewMenuItems } from "./view-rail-model";

const SEARCHABLE_FROM = 8;

type Props<E extends HasId> = {
  canShareViews: boolean;
  canWriteViews: boolean;
  commands: ViewCommands;
  isOrphaned: boolean;
  open: boolean;
  store: BaseDataViewStore<E>;
  trigger: ReactNode;
  onOpenChange: (open: boolean) => void;
};

export const ViewPickerOverlay = observer(function ViewPickerOverlay<E extends HasId>({
  canShareViews,
  canWriteViews,
  commands,
  isOrphaned,
  open,
  store,
  trigger,
  onOpenChange,
}: Props<E>) {
  const t = useTranslations();
  const [query, setQuery] = useState("");

  const owned = ownedViewsInOrder(store.views);
  const needle = query.trim().toLowerCase();
  const matching = sortViewsByPosition(store.views).filter((view) => view.name.toLowerCase().includes(needle));
  const groups: { label: string; views: DataViewChipDto[] }[] = [
    { label: t("DataView.views.yours"), views: matching.filter((view) => view.isOwner) },
    { label: t("DataView.views.sharedWithYou"), views: matching.filter((view) => !view.isOwner) },
  ];

  function select(viewKey: string) {
    onOpenChange(false);
    commands.select(viewKey);
  }

  function row(view: DataViewChipDto) {
    const isActive = view.id === store.activeViewKey;
    const items = viewMenuItems(view, {
      canShareViews,
      canWriteViews,
      index: owned.findIndex((candidate) => candidate.id === view.id),
      isDirty: isActive && store.viewIsDirty,
      total: owned.length,
    });

    return (
      <div key={view.id} className="flex items-center gap-1">
        <button
          aria-current={isActive ? "page" : undefined}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent aria-[current=page]:bg-accent"
          type="button"
          onClick={() => select(view.id)}
        >
          <span className="flex w-full min-w-0 items-center gap-1.5 text-sm">
            <span className="truncate">{view.name}</span>

            {view.visibility === "workspace" && <UsersIcon aria-hidden className="size-3 shrink-0 opacity-60" />}
          </span>

          {!view.isOwner && (
            <span className="text-[11px] text-muted-foreground">
              {t("DataView.views.ownedBy", { name: view.ownerName ?? "" })}
            </span>
          )}

          {view.isOwner && view.visibility === "workspace" && (
            <span className="text-[11px] text-muted-foreground">{t("DataView.views.sharedState")}</span>
          )}

          {isActive && (
            <span className="text-[11px] text-muted-foreground">
              {t("DataView.views.recordCount", { count: store.pagination?.total ?? 0 })}
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("DataView.views.menuFor", { name: view.name })}
              className="size-6 shrink-0"
              size="icon-xs"
              variant="ghost"
            >
              <MoreHorizontalIcon aria-hidden />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end">
            <ViewMenuItems commands={commands} items={items} view={view} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <ResponsiveOverlay
      align="end"
      open={open}
      popoverClassName="w-80"
      title={t("DataView.views.pickerTitle")}
      trigger={trigger}
      onOpenChange={onOpenChange}
    >
      <div className="flex flex-col gap-1 p-2" data-data-view-picker="">
        {isOrphaned && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-2">
            <span className="text-sm font-medium">{t("DataView.views.unavailable")}</span>

            <span className="text-[11px] text-muted-foreground">{t("DataView.views.unavailableBody")}</span>

            <div className="flex flex-wrap gap-1.5">
              <Button size="xs" variant="default" onClick={() => commands.create()}>
                {t("DataView.views.saveAsNew")}
              </Button>

              <Button size="xs" variant="secondary" onClick={() => select(ALL_VIEW_KEY)}>
                {t("DataView.views.all")}
              </Button>
            </div>
          </div>
        )}

        {canWriteViews && (
          <Button className="justify-start" size="sm" variant="ghost" onClick={() => commands.create()}>
            <PlusIcon aria-hidden />

            {t("DataView.views.createTitle")}
          </Button>
        )}

        {store.views.length > SEARCHABLE_FROM && (
          <Input
            className="h-8"
            placeholder={t("DataView.views.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        )}

        {store.views.length === 0 && (
          <div className="flex flex-col gap-1 px-2 py-3">
            <span className="text-sm">{t("DataView.views.empty")}</span>

            <span className="text-[11px] text-muted-foreground">{t("DataView.views.emptyHint")}</span>
          </div>
        )}

        {store.views.length > 0 && matching.length === 0 && (
          <div className="flex flex-col gap-1 px-2 py-3">
            <span className="text-sm">{t("Common.inputs.emptyContent")}</span>
          </div>
        )}

        {groups.map(
          (group) =>
            group.views.length > 0 && (
              <div key={group.label} className="flex flex-col gap-0.5">
                <span className="px-2 pt-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </span>

                {group.views.map(row)}
              </div>
            ),
        )}
      </div>
    </ResponsiveOverlay>
  );
});
