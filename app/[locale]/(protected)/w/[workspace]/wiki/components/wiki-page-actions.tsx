"use client";

import type { ReactNode } from "react";
import type { WikiPageStore } from "./wiki-page.store";
import type { WikiSearchStore } from "./wiki-search.store";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { TopBarPrimaryButton } from "@/components/shared/top-bar-action-buttons";
import { Action } from "@/generated/prisma";

import { WikiPageSearch } from "./wiki-page-search";

type Props = {
  store: WikiPageStore;
  search: WikiSearchStore | null;
  onCreate: () => void;
  onOpenFirst: () => void;
  proposals?: ReactNode;
};

export const WikiPageActions = observer(({ store, search, onCreate, onOpenFirst, proposals }: Props) => {
  const t = useTranslations();

  return (
    <div className="flex items-center gap-1">
      {search && <WikiPageSearch store={search} onOpenFirst={onOpenFirst} />}

      {proposals}

      {store.allows(Action.create) && (
        <TopBarPrimaryButton disabled={store.isLoading} label={t("Wiki.newPage")} onClick={onCreate} />
      )}
    </div>
  );
});
