"use client";

import type { ReactNode } from "react";
import type { WikiView } from "@/features/p13n/p13n-settings.schema";
import type { WikiPageStore } from "./wiki-page.store";
import type { WikiSearchStore } from "./wiki-search.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { Action } from "@/generated/prisma";

import { WikiPageSearch } from "./wiki-page-search";
import { WikiViewSwitch } from "./wiki-view-switch";

type Props = {
  store: WikiPageStore;
  search: WikiSearchStore | null;
  view: WikiView | null;
  onCreate: () => void;
  onOpenFirst: () => void;
  onViewChange: (view: WikiView) => void;
  proposals?: ReactNode;
};

export const WikiPageActions = observer(
  ({ store, search, view, onCreate, onOpenFirst, onViewChange, proposals }: Props) => {
    const t = useTranslations();

    return (
      <div className="flex items-center gap-1">
        {search && <WikiPageSearch store={search} onOpenFirst={onOpenFirst} />}

        {view && <WikiViewSwitch view={view} onChange={onViewChange} />}

        {proposals}

        {store.allows(Action.create) && (
          <TopBarPrimaryButton disabled={store.isLoading} label={t("Wiki.newPage")} onClick={onCreate} />
        )}
      </div>
    );
  },
);
