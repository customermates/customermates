"use client";

import type { EditorLinkPickerProps } from "@/components/editor/editor-link-picker";
import type { WikiPageListResult } from "@/features/wiki/wiki.schema";

import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useWikiPages } from "./use-wiki-pages";

const emptyList: WikiPageListResult = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 25,
};

export function WikiLinkPicker({ onSelect }: EditorLinkPickerProps) {
  const t = useTranslations();
  const pages = useWikiPages(emptyList, true);

  return (
    <Command shouldFilter={false}>
      <CommandInput
        aria-label={t("Wiki.linkPage")}
        maxLength={200}
        placeholder={t("Wiki.linkPage")}
        value={pages.query}
        onValueChange={pages.search}
      />

      <CommandList aria-busy={pages.loading}>
        {pages.failed ? (
          <p className="p-3 text-sm text-muted-foreground">{t("Wiki.loadFailed")}</p>
        ) : pages.loading ? (
          <p className="p-3 text-sm text-muted-foreground" role="status">
            {t("PageState.loading")}
          </p>
        ) : pages.result.items.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">{t("Wiki.noResults")}</p>
        ) : (
          <CommandGroup heading={t("Wiki.pagesLabel")}>
            {pages.result.items.map((page) => (
              <CommandItem
                key={page.id}
                value={page.id}
                onSelect={() => onSelect({ href: `/wiki?page=${page.id}`, title: page.title })}
              >
                <FileText />

                <span className="truncate">{page.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      {!pages.loading && pages.result.total > pages.result.pageSize && (
        <div className="flex justify-between border-t border-border pt-1">
          <Button disabled={pages.page === 1} size="xs" variant="ghost" onClick={() => pages.setPage(pages.page - 1)}>
            {t("Wiki.previous")}
          </Button>

          <Button
            disabled={pages.page * pages.result.pageSize >= pages.result.total}
            size="xs"
            variant="ghost"
            onClick={() => pages.setPage(pages.page + 1)}
          >
            {t("Wiki.next")}
          </Button>
        </div>
      )}
    </Command>
  );
}
