"use client";

import type { WikiGraphNode } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageKind } from "@/features/wiki/wiki.schema";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/core/utils/cn";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { WIKI_PAGE_KINDS } from "@/features/wiki/wiki.schema";
import { IntlLink } from "@/i18n/navigation";

import { WIKI_GRAPH_KIND_DOT } from "./wiki-graph-model";

type Props = {
  nodes: ReadonlyArray<Pick<WikiGraphNode, "id" | "title" | "kind">>;
  visible: ReadonlySet<string>;
  truncated: boolean;
  onSelect: (id: string) => void;
};

export function WikiPageList({ nodes, visible, truncated, onSelect }: Props) {
  const t = useTranslations();
  const headings: Record<WikiPageKind, string> = {
    guide: t("Wiki.kind.guide"),
    procedure: t("Wiki.graph.filter.procedure"),
    knowledge: t("Wiki.graph.filter.knowledge"),
  };
  const shown = nodes.filter((node) => visible.has(node.id));

  return (
    <nav aria-label={t("Wiki.pagesLabel")} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-3">
      {shown.length === 0 && <p className="p-3 text-sm text-muted-foreground">{t("Wiki.graph.noMatches")}</p>}

      {WIKI_PAGE_KINDS.map((kind) => {
        const pages = shown.filter((node) => node.kind === kind);
        if (pages.length === 0) return null;
        return (
          <section key={kind} className="pb-3">
            <h2 className="px-2 pb-1 text-xs font-medium text-muted-foreground">{`${headings[kind]} · ${pages.length}`}</h2>

            <ul>
              {pages.map((page) => (
                <li key={page.id}>
                  <Button
                    asChild
                    className="h-auto min-h-10 w-full justify-start gap-2.5 p-2 text-left font-normal"
                    variant="ghost"
                  >
                    <IntlLink
                      href={wikiPagePath(page.id)}
                      onClick={(event) => {
                        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
                          return;
                        event.preventDefault();
                        onSelect(page.id);
                      }}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("size-2.5 shrink-0 rounded-full", WIKI_GRAPH_KIND_DOT[page.kind])}
                      />

                      <span className="min-w-0 break-words">{page.title}</span>
                    </IntlLink>
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {truncated && (
        <p className="px-2 text-xs text-muted-foreground">{t("Wiki.graph.truncated", { count: nodes.length })}</p>
      )}
    </nav>
  );
}
