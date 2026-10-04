"use client";

import type { WikiPageKind, WikiPageSummary } from "@/features/wiki/wiki.schema";
import type { LucideIcon } from "lucide-react";
import type { useWikiPages } from "./use-wiki-pages";

import type { ReactNode } from "react";
import type { DragEndEvent } from "@dnd-kit/core";

import { useId } from "react";
import { toast } from "sonner";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Compass, FileText, GripVertical, ListChecks, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { observer } from "mobx-react-lite";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IntlLink } from "@/i18n/navigation";
import { cn } from "@/core/utils/cn";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { wikiPagePath } from "@/features/wiki/wiki-links";

const WIKI_KIND_ICONS: Record<WikiPageKind, LucideIcon> = {
  guide: Compass,
  procedure: ListChecks,
  knowledge: FileText,
};

type Props = {
  busy: boolean;
  canManage: boolean;
  currentPageId: string | null;
  pages: ReturnType<typeof useWikiPages>;
  pinnedPage: WikiPageSummary | null;
  onSelect: (pageId: string) => void;
};

function SortablePage({
  page,
  disabled,
  showHandle,
  children,
}: {
  page: WikiPageSummary;
  disabled: boolean;
  showHandle: boolean;
  children: ReactNode;
}) {
  const t = useTranslations();
  const sortable = useSortable({ id: page.id, disabled });
  return (
    <div
      ref={sortable.setNodeRef}
      className={cn(
        "group relative flex min-w-0 items-center rounded-md",
        sortable.isDragging && "z-10 bg-card shadow-md",
      )}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
    >
      <div className="min-w-0 flex-1">{children}</div>

      {showHandle && (
        <button
          ref={sortable.setActivatorNodeRef}
          {...sortable.attributes}
          {...sortable.listeners}
          aria-disabled={disabled}
          aria-label={`${t("DataView.dragToReorder")}: ${page.title}`}
          className="mr-1 flex size-6 shrink-0 touch-none items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing cursor-grab sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export const WikiPageRail = observer(function WikiPageRail({
  busy,
  canManage,
  currentPageId,
  pages,
  pinnedPage,
  onSelect,
}: Props) {
  const t = useTranslations();
  const contextId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reorderDisabled =
    !canManage || busy || pages.loading || pages.reordering || Boolean(pages.query) || pages.failed;
  const movablePages = pages.result.items.filter((page) => page.kind !== "guide");
  async function handleDragEnd({ active, over }: DragEndEvent) {
    if (reorderDisabled || !over || active.id === over.id) return;
    const from = movablePages.findIndex((page) => page.id === active.id);
    const to = movablePages.findIndex((page) => page.id === over.id);
    if (from < 0 || to < 0) return;
    const result = await pages.move(String(active.id), String(over.id), from < to ? "after" : "before");
    if (!result || (!result.ok && !toastZodErrorTree(result.error)))
      toast.error(t("Common.notifications.unexpectedError"));
  }
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
            <DndContext
              collisionDetection={closestCenter}
              id={contextId}
              sensors={sensors}
              onDragEnd={(event) => runUserAction(() => handleDragEnd(event))}
            >
              <SortableContext items={movablePages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
                {pages.result.items.map((page) =>
                  page.kind === "guide" ? (
                    pageLink(page)
                  ) : (
                    <SortablePage
                      key={page.id}
                      disabled={reorderDisabled}
                      page={page}
                      showHandle={canManage && !pages.query}
                    >
                      {pageLink(page)}
                    </SortablePage>
                  ),
                )}
              </SortableContext>
            </DndContext>
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
});
