"use client";

import type { WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { useWikiPages } from "./use-wiki-pages";

import { Compass, FileText, ListChecks, Search } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { wikiPagePath } from "@/features/wiki/wiki-links";

const WIKI_KIND_ICONS = {
  guide: Compass,
  procedure: ListChecks,
  knowledge: FileText,
} as const;

type Props = {
  busy: boolean;
  currentPageId: string | null;
  pages: ReturnType<typeof useWikiPages>;
  pinnedPage: WikiPageSummary | null;
  onSelect: (pageId: string) => void;
};

export function WikiPageRail({ busy, currentPageId, pages, pinnedPage, onSelect }: Props) {
  const t = useTranslations();
  const pageLink = (page: WikiPageSummary) => {
    const current = page.id === currentPageId;
    const PageIcon = WIKI_KIND_ICONS[page.kind];
    return (
      <Button
        key={page.id}
        asChild
        className={cn(
          "mb-0.5 h-auto min-h-9 w-full justify-start gap-2 p-2 text-left font-normal",
          current && "bg-accent text-accent-foreground",
          busy && "pointer-events-none opacity-50",
        )}
        variant="ghost"
      >
        <IntlLink
          aria-current={current ? "page" : undefined}
          aria-disabled={busy || undefined}
          href={wikiPagePath(page.id)}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
            event.preventDefault();
            if (!busy) onSelect(page.id);
          }}
        >
          <PageIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />

          <span className="truncate">{page.title}</span>

          {page.draft && (
            <span className="ml-auto shrink-0 rounded border border-border px-1 text-[0.65rem] uppercase text-muted-foreground">
              {t("Wiki.draft.badge")}
            </span>
          )}
        </IntlLink>
      </Button>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mx-3 mb-3 mt-4">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />

        <Input
          aria-label={t("Wiki.search")}
          className="h-8 pl-8"
          maxLength={200}
          placeholder={t("Wiki.search")}
          type="search"
          value={pages.query}
          onChange={(event) => pages.search(event.target.value)}
        />
      </div>

      <nav
        aria-busy={pages.loading}
        aria-label={t("Wiki.pagesLabel")}
        className="flex min-h-0 flex-1 flex-col px-2 pb-2"
      >
        {pinnedPage && <div className="pb-1">{pageLink(pinnedPage)}</div>}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {pages.failed ? (
            <div className="space-y-2 p-3 text-sm text-muted-foreground">
              <p>{t("Wiki.loadFailed")}</p>

              <Button size="xs" variant="secondary" onClick={pages.retry}>
                {t("ErrorCard.retry")}
              </Button>
            </div>
          ) : pages.result.items.length === 0 ? (
            pages.query ? (
              <p className="p-3 text-sm text-muted-foreground">{t("Wiki.noResults")}</p>
            ) : null
          ) : (
            pages.result.items.map(pageLink)
          )}
        </div>

        {pages.loading && (
          <span className="sr-only" role="status">
            {t("PageState.loading")}
          </span>
        )}
      </nav>

      {(pages.page > 1 || pages.hasMore) && (
        <div className="flex items-center justify-between gap-1 border-t border-border p-2 text-xs text-muted-foreground">
          <Button
            disabled={pages.loading || pages.page <= 1}
            size="xs"
            variant="ghost"
            onClick={() => pages.setPage(pages.page - 1)}
          >
            {t("Wiki.previous")}
          </Button>

          <span>
            {pages.totalIsExact
              ? t("Wiki.page", {
                  current: pages.page,
                  total: Math.ceil(pages.result.total / pages.result.pageSize),
                })
              : pages.page}
          </span>

          <Button
            disabled={pages.loading || !pages.hasMore}
            size="xs"
            variant="ghost"
            onClick={() => pages.setPage(pages.page + 1)}
          >
            {t("Wiki.next")}
          </Button>
        </div>
      )}
    </div>
  );
}
