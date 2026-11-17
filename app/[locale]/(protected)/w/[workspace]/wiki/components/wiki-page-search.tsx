"use client";

import type { WikiSearchStore } from "./wiki-search.store";

import { observer } from "mobx-react-lite";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

export const WikiPageSearch = observer(function WikiPageSearch({
  store,
  onOpenFirst,
}: {
  store: WikiSearchStore;
  onOpenFirst: () => void;
}) {
  const t = useTranslations();
  return (
    <div className="relative w-32 sm:w-56" data-wiki-page-search="">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
      />

      <Input
        aria-label={t("Wiki.graph.search")}
        className="h-8 pl-8"
        maxLength={200}
        placeholder={t("Wiki.graph.search")}
        type="search"
        value={store.query}
        onChange={(event) => store.setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || !store.query.trim()) return;
          event.preventDefault();
          onOpenFirst();
        }}
      />
    </div>
  );
});
