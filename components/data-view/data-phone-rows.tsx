"use client";

import type { ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { Fragment } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { useNavigateToHref } from "@/components/shared/use-navigate-to-href";
import { cn } from "@/core/utils/cn";

import { DataViewItemLayout } from "./data-view-item-layout";
import { useGroupLabel, visibleGroups } from "./group-label";

type Props<E extends HasId> = {
  store: BaseDataViewStore<E>;
  renderCard: (item: E) => ReactNode;
  className?: string;
  onRowClick?: (item: E) => void;
  rowActions?: (item: E) => ReactNode;
  onRowHref?: (item: E) => string | undefined;
  rowFocusKey?: (item: E) => string | undefined;
};

export const DataPhoneRows = observer(function DataPhoneRows<E extends HasId>({
  store,
  renderCard,
  className,
  onRowClick,
  rowActions,
  onRowHref,
  rowFocusKey,
}: Props<E>) {
  const t = useTranslations();
  const navigateToHref = useNavigateToHref();
  const groupLabel = useGroupLabel(store.groupingResult);
  const groups = visibleGroups(store.groupingResult);
  const itemsById = new Map(store.items.map((item) => [item.id, item]));
  const renderPhoneRow = (item: E) => {
    const href = onRowHref?.(item);
    const open = () => {
      if (onRowClick) onRowClick(item);
      else if (href) navigateToHref(href);
    };
    return (
      <li
        key={item.id}
        className="group/row relative px-4 py-3 transition-colors hover:bg-accent has-[>a:focus-visible]:bg-accent"
        data-focus-target={rowFocusKey?.(item)}
        data-row-id={item.id}
      >
        {href && (
          <a
            aria-label={t("Common.actions.open")}
            className="absolute inset-0 outline-none"
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
              event.preventDefault();
              event.stopPropagation();
              open();
            }}
          />
        )}

        <div className="pointer-events-none relative [&_[data-add-property]]:pointer-events-auto [&_[data-chip-column]]:pointer-events-auto">
          {renderCard(item)}
        </div>

        {rowActions && (
          <div className="absolute top-2 right-2">
            <DataViewItemLayout.Provider value="card">{rowActions(item)}</DataViewItemLayout.Provider>
          </div>
        )}
      </li>
    );
  };
  return (
    <ul className={cn("divide-y divide-border border-b border-border", className)} data-phone-rows="" data-slot="table">
      {!store.isGrouped
        ? store.items.map(renderPhoneRow)
        : groups.map((group) => (
            <Fragment key={group.key}>
              <li className="flex items-center gap-2 bg-muted/40 px-4 py-2" data-slot="group-header-row">
                {group.color ? (
                  <AppChip size="sm" variant={group.color}>
                    <span className="truncate">{groupLabel(group)}</span>
                  </AppChip>
                ) : (
                  <span className="min-w-0 truncate text-sm font-medium">{groupLabel(group)}</span>
                )}

                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{group.count}</span>
              </li>

              {group.itemIds.flatMap((id) => {
                const item = itemsById.get(id);
                return item ? [renderPhoneRow(item)] : [];
              })}
            </Fragment>
          ))}
    </ul>
  );
});
