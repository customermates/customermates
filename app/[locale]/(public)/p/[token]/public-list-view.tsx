"use client";

import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { PublicList } from "@/features/public-link/public-link.schema";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { DataViewDisplayOptions } from "@/components/data-view/header/display-options";
import { FilterPopover } from "@/components/data-view/header/filter-popover";
import { ScopedRecordsTable } from "@/components/records/scoped-records-sheet";
import { useRootStore } from "@/core/stores/root-store.provider";

import { readPublicListRecordsAction } from "./actions";
import { PublicExportAction } from "./public-export-action";
import { PublicLinkFrame } from "./public-link-frame";
import { PublicRecordExplorationStore } from "./public-record-exploration.store";
import { publicRecordsQuery } from "./public-records-query";

const PublicListTable = observer(function PublicListTable({ list, token }: { list: PublicList; token: string }) {
  const t = useTranslations();
  const root = useRootStore();
  const upsell = root.appMode === "cloud";
  const [store] = useState(
    () =>
      new PublicRecordExplorationStore(root, list.presentation, async (params?: GetQueryParams) => {
        const result = await readPublicListRecordsAction({ token, ...publicRecordsQuery(params) });
        if (result.status !== "available") throw new Error(`Public list ${result.status}`);
        return result.presentation;
      }),
  );

  const count = store.pagination?.total ?? store.items.length;

  return (
    <AppCard className="flex h-[min(78dvh,960px)] min-h-96 flex-col overflow-hidden pt-0" id="public-list">
      <div className="flex items-center justify-between gap-2 px-6 py-2">
        <p className="min-w-0 truncate text-sm text-muted-foreground" id="public-list-summary">
          {t("PublicLink.listCount", { count })}
        </p>

        <div className="flex shrink-0 items-center gap-1">
          <FilterPopover
            compact
            id="public-list-filter"
            searchLabel={list.searchable ? t("PublicLink.searchLabel") : undefined}
            store={store}
          />

          <DataViewDisplayOptions
            compact
            active={store.hasLayoutChanges}
            anchorScope="public-list"
            id="public-list-display-options"
            store={store}
          />

          {upsell ? <PublicExportAction count={count} id="public-list-export" /> : null}
        </div>
      </div>

      <ScopedRecordsTable emptyTitle={t("PublicLink.emptyList")} store={store} />
    </AppCard>
  );
});

export function PublicListView({ list, token }: { list: PublicList; token: string }) {
  return (
    <PublicLinkFrame expiresAt={list.expiresAt} kind="list" name={list.name} workspaceName={list.workspaceName}>
      <PublicListTable list={list} token={token} />
    </PublicLinkFrame>
  );
}
