"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ResizablePanelDefinition } from "@/components/layout/resizable-panels";
import { ResizablePanelGroup } from "@/components/layout/resizable-panels";
import { mergeStoredPanelSizes, readStoredPanelSizes } from "@/components/layout/resizable-panels.utils";
import { useP13nColumnWidths } from "@/components/shared/use-p13n-column-widths";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { cn } from "@/core/utils/cn";

type DetailPanel = "details" | "notes" | "activities";

export type EntityDetailPanelLayout = {
  initial?: Readonly<Record<string, number>>;
  p13nId?: string;
  persistenceScope: string;
};

const PANEL_SIZES: Record<DetailPanel, { minimumSize: number; defaultSize: (all: boolean) => number }> = {
  details: { minimumSize: 320, defaultSize: (all) => (all ? 600 : 640) },
  notes: { minimumSize: 280, defaultSize: (all) => (all ? 400 : 320) },
  activities: { minimumSize: 320, defaultSize: () => 360 },
};

export function EntityDetailPanels({
  details,
  notes,
  activities,
  summary,
  initialPanel = "details",
  panelLayout,
}: {
  details: ReactNode;
  notes?: ReactNode;
  activities?: ReactNode;
  summary?: ReactNode;
  initialPanel?: DetailPanel;
  panelLayout?: EntityDetailPanelLayout;
}) {
  const t = useTranslations();
  const id = useId();
  const [activePanel, setActivePanel] = useState<DetailPanel>(initialPanel);
  const [isSplit, setIsSplit] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);
  const hasTabs = Boolean(notes || activities);
  const selectedPanel =
    (activePanel === "notes" && !notes) || (activePanel === "activities" && !activities) ? "details" : activePanel;
  useEffect(() => {
    const switcher = switcherRef.current;
    if (!switcher) return;
    const update = () => setIsSplit(getComputedStyle(switcher).display === "none");
    update();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", update);
      return () => window.removeEventListener("resize", update);
    }
    const observer = new ResizeObserver(update);
    observer.observe(switcher);
    return () => observer.disconnect();
  }, [hasTabs]);
  const panels: { key: DetailPanel; label: string; content: ReactNode }[] = [
    { key: "details", label: t("EntityDetail.overview"), content: details },
    ...(notes ? [{ key: "notes" as const, label: t("EntityDetail.sections.notes"), content: notes }] : []),
    ...(activities
      ? [{ key: "activities" as const, label: t("EntityTimeline.types.activities"), content: activities }]
      : []),
  ];
  const hasNotes = Boolean(notes);
  const hasActivities = Boolean(activities);
  const panelIds = useMemo<DetailPanel[]>(
    () => ["details", ...(hasNotes ? ["notes" as const] : []), ...(hasActivities ? ["activities" as const] : [])],
    [hasActivities, hasNotes],
  );
  const panelLayoutId = panelIds.join("-");
  const { columnWidths, commitColumnWidths } = useP13nColumnWidths({
    initial: panelLayout?.initial,
    p13nId: panelLayout?.p13nId,
    persistenceScope: panelLayout?.persistenceScope ?? "anonymous",
  });
  const initialPanelSizes = readStoredPanelSizes(columnWidths, panelLayoutId, panelIds);
  const savePanelSizes = useCallback(
    (sizes: readonly number[] | null) =>
      commitColumnWidths((current) => mergeStoredPanelSizes(current, panelLayoutId, panelIds, sizes)),
    [commitColumnWidths, panelIds, panelLayoutId],
  );
  const allPanels = hasNotes && hasActivities;
  const defaultTemplate =
    notes && activities
      ? "minmax(0, 3fr) 1px minmax(0, 2fr) 1px 360px"
      : notes
        ? "minmax(0, 2fr) 1px minmax(0, 1fr)"
        : activities
          ? "minmax(0, 1fr) 1px 360px"
          : "minmax(0, 1fr)";
  const definitions: ResizablePanelDefinition[] = panels.map((panel) => ({
    id: panel.key,
    label: panel.label,
    controlId: `${id}-${panel.key}-panel`,
    minimumSize: PANEL_SIZES[panel.key].minimumSize,
    defaultSize: PANEL_SIZES[panel.key].defaultSize(allPanels),
    element: (
      <div
        aria-label={
          hasTabs && isSplit ? (panel.key === "activities" ? t("Common.actions.labelHistory") : panel.label) : undefined
        }
        aria-labelledby={hasTabs && !isSplit ? `${id}-tab-${panel.key}` : undefined}
        className={cn(
          "min-w-0 flex-col bg-background",
          selectedPanel === panel.key ? "flex" : "hidden",
          "@6xl/detail:flex @6xl/detail:min-h-0 @6xl/detail:overflow-x-hidden @6xl/detail:overflow-y-auto",
        )}
        data-detail-panel={panel.key}
        id={`${id}-${panel.key}-panel`}
        role={hasTabs ? (isSplit ? "region" : "tabpanel") : undefined}
        tabIndex={hasTabs && !isSplit ? 0 : undefined}
      >
        {panel.content}
      </div>
    ),
  }));
  return (
    <div className="@container/detail flex min-h-0 w-full flex-1 flex-col">
      <div className="animate-page-result-in flex min-h-0 w-full flex-1 flex-col overflow-y-auto motion-reduce:animate-none @6xl/detail:overflow-y-visible">
        {summary}

        {hasTabs && (
          <div
            ref={switcherRef}
            data-detail-panel-switcher
            className="sticky top-0 z-10 border-b border-border bg-background @6xl/detail:hidden"
          >
            <SegmentedControl
              idPrefix={id}
              items={panels.map((panel) => ({
                value: panel.key,
                label: panel.label,
                controls: `${id}-${panel.key}-panel`,
              }))}
              label={t("EntityDetail.overview")}
              listClassName="mx-4 my-2 w-auto"
              value={selectedPanel}
              onValueChange={(value) => setActivePanel(value)}
            />
          </div>
        )}

        <ResizablePanelGroup
          data-detail-grid
          className="grid grid-cols-1 contain-[layout] @6xl/detail:flex-1 @6xl/detail:min-h-0 @6xl/detail:grid-cols-[var(--panel-grid-template)]"
          defaultTemplate={defaultTemplate}
          handleClassName="hidden @6xl/detail:flex"
          initialSizes={initialPanelSizes}
          panels={definitions}
          onSizesCommit={savePanelSizes}
        />
      </div>
    </div>
  );
}
