"use client";

import type { WikiGraphNode, WikiGraphRecordType, WikiPageLinks } from "@/features/wiki/wiki-graph.schema";
import type { WikiPageDto, WikiPageKind } from "@/features/wiki/wiki.schema";

import { useMemo, useState } from "react";
import { ArrowUpRight, Pin, PinOff, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { Editor } from "@/components/editor/editor";
import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { SkeletonShape } from "@/components/page-state/skeleton-shape";
import { recordTypeIcon } from "@/components/records/record-type-icon";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/ui/button";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { cn } from "@/core/utils/cn";
import { IntlLink } from "@/i18n/navigation";

import { WIKI_GRAPH_KIND_DOT } from "./wiki-graph-model";

type Segment = "page" | "links";

type Props = {
  node: WikiGraphNode;
  page: WikiPageDto | null | undefined;
  links: WikiPageLinks | null | undefined;
  failed: boolean;
  canPin: boolean;
  kindLabels: Record<WikiPageKind, string>;
  onClose: () => void;
  onOpen: (id: string) => void;
  onSelect: (id: string) => void;
  onTogglePin: () => void;
};

function LinkedPages({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: WikiPageLinks["linkedFrom"];
  onSelect: (id: string) => void;
}) {
  const t = useTranslations();
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{`${title} · ${items.length}`}</h3>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("Wiki.graph.noLinks")}</p>
      ) : (
        <ul className="-mx-2">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                className="h-auto min-h-8 w-full justify-start gap-2 px-2 py-1 text-left font-normal"
                variant="ghost"
                onClick={() => onSelect(item.id)}
              >
                <span
                  aria-hidden="true"
                  className={cn("size-2 shrink-0 rounded-full", WIKI_GRAPH_KIND_DOT[item.kind])}
                />

                <span className="truncate">{item.title}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function RecordLinks({ items }: { items: Array<WikiGraphRecordType & { count: number }> }) {
  const t = useTranslations();
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{t("Wiki.graph.records")}</h3>

      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const Icon = recordTypeIcon(item.icon);
          return (
            <IntlLink
              key={item.id}
              className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              href={`/records/${item.id}`}
            >
              <AppChip interactive startContent={<Icon aria-hidden="true" />} variant={item.color ?? "secondary"}>
                {`${item.pluralLabel} · ${item.count}`}
              </AppChip>
            </IntlLink>
          );
        })}
      </div>
    </section>
  );
}

export function WikiGraphDrawer({
  node,
  page,
  links,
  failed,
  canPin,
  kindLabels,
  onClose,
  onOpen,
  onSelect,
  onTogglePin,
}: Props) {
  const t = useTranslations();
  const [segment, setSegment] = useState<Segment>("page");
  const document = useMemo(() => (page ? parseMarkdownToJSON(page.markdown) : null), [page]);
  const loading = page === undefined || links === undefined;

  return (
    <aside
      aria-label={t("Wiki.graph.drawerLabel", { title: node.title })}
      className="absolute inset-y-0 right-0 flex w-[min(32rem,100%)] flex-col border-l border-border bg-card shadow-md animate-in slide-in-from-right-4 fade-in-0 motion-reduce:animate-none"
      data-wiki-graph-drawer=""
    >
      <header className="flex items-start gap-3 border-b border-border px-5 pt-4 pb-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <AppChip
              startContent={
                <span aria-hidden="true" className={cn("size-2 rounded-full", WIKI_GRAPH_KIND_DOT[node.kind])} />
              }
            >
              {kindLabels[node.kind]}
            </AppChip>

            <span>{t("Wiki.graph.linkCounts", { inbound: node.inbound, outbound: node.outbound })}</span>

            {node.pinned && <AppChip>{t("Wiki.graph.pinned")}</AppChip>}
          </div>

          <h2 className="text-lg leading-snug font-semibold tracking-tight break-words">{node.title}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canPin && (
            <Button
              aria-label={node.pinned ? t("Wiki.graph.unpin") : t("Wiki.graph.pin")}
              size="icon"
              variant="ghost"
              onClick={onTogglePin}
            >
              {node.pinned ? <PinOff aria-hidden="true" /> : <Pin aria-hidden="true" />}
            </Button>
          )}

          <Button size="sm" variant="secondary" onClick={() => onOpen(node.id)}>
            <ArrowUpRight aria-hidden="true" />

            {t("Wiki.graph.openPage")}
          </Button>

          <Button aria-label={t("Common.actions.close")} size="icon" variant="ghost" onClick={onClose}>
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 pt-3 pb-5">
        <SegmentedControl
          className="min-h-0 flex-1 gap-3"
          idPrefix="wiki-graph-drawer"
          items={[
            { value: "page", label: t("Wiki.graph.segments.page") },
            { value: "links", label: t("Wiki.graph.segments.links") },
          ]}
          label={t("Wiki.graph.drawerSegments")}
          listClassName="w-fit auto-cols-auto"
          value={segment}
          onValueChange={setSegment}
        >
          <SegmentedControlPanel className="m-0 min-h-0 flex-1 overflow-y-auto" value="page">
            {failed ? (
              <Alert description={t("Wiki.unavailableBody")} variant="destructive" />
            ) : loading || !page || !document ? (
              <div className="space-y-3 pt-1">
                <SkeletonShape animated className="h-4 w-full" />

                <SkeletonShape animated className="h-4 w-11/12" motionPhase={1} />

                <SkeletonShape animated className="h-4 w-4/5" motionPhase={2} />
              </div>
            ) : (
              <div className="space-y-4">
                {page.kind === "procedure" && page.whenToUse && (
                  <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t("Wiki.whenToUse.label")}: </span>

                    {page.whenToUse}
                  </p>
                )}

                <Editor readOnly data={document} label={node.title} toolbar={false} />
              </div>
            )}
          </SegmentedControlPanel>

          <SegmentedControlPanel className="m-0 min-h-0 flex-1 space-y-5 overflow-y-auto" value="links">
            {failed ? (
              <Alert description={t("Wiki.unavailableBody")} variant="destructive" />
            ) : !links ? (
              <div className="space-y-3 pt-1">
                <SkeletonShape animated className="h-4 w-2/3" />

                <SkeletonShape animated className="h-4 w-1/2" motionPhase={1} />
              </div>
            ) : (
              <>
                <LinkedPages items={links.linkedFrom} title={t("Wiki.graph.linkedFrom")} onSelect={onSelect} />

                <LinkedPages items={links.linksTo} title={t("Wiki.graph.linksTo")} onSelect={onSelect} />

                {links.missing > 0 && (
                  <p className="text-sm text-destructive-soft-foreground">
                    {t("Wiki.graph.missingLinks", { count: links.missing })}
                  </p>
                )}

                <RecordLinks items={links.records} />
              </>
            )}
          </SegmentedControlPanel>
        </SegmentedControl>
      </div>
    </aside>
  );
}
