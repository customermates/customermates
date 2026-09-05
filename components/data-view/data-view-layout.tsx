"use client";

import type { ReactNode } from "react";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";

import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";

import { ScrollReturnButton } from "@/components/scroll/scroll-return-button";
import { useScrollReturn } from "@/components/scroll/use-scroll-return";

import { DataViewPagination } from "./header/pagination";
import { MassActionsBar } from "./mass-actions-bar";
import { DataViewViewsRail } from "./views/data-view-views-rail";

type Props<E extends HasId> = {
  children: ReactNode;
  showPagination: boolean;
  store: BaseDataViewStore<E>;
};

export function DataViewLayout<E extends HasId>({ children, showPagination, store }: Props<E>) {
  const t = useTranslations();
  const scrollHostRef = useRef<HTMLDivElement>(null);
  const getScrollElement = useCallback(
    () =>
      scrollHostRef.current?.querySelector<HTMLElement>(
        "[data-slot=table-container],[data-slot=kanban-root],[data-slot=card-grid]",
      ) ?? null,
    [],
  );
  const { isAway, returnToAnchor } = useScrollReturn({
    direction: "top",
    enabled: store.items.length > 0,
    getScrollElement,
  });

  return (
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col md:h-[calc(100svh-5rem)]">
      <DataViewViewsRail joinsTopBar store={store} />

      <MassActionsBar store={store} />

      <div
        ref={scrollHostRef}
        className="relative flex min-h-0 flex-1 flex-col overflow-hidden *:data-[slot=table-container]:h-full *:data-[slot=table-container]:overflow-auto *:data-[slot=kanban-root]:h-full *:data-[slot=kanban-root]:overflow-auto *:data-[slot=card-grid]:h-full *:data-[slot=card-grid]:overflow-y-auto"
        style={{ contain: "layout" }}
      >
        {children}

        <ScrollReturnButton
          direction="top"
          isAway={isAway}
          label={t("Common.scroll.backToTop")}
          onReturn={returnToAnchor}
        />
      </div>

      {showPagination && <DataViewPagination store={store} />}
    </div>
  );
}
