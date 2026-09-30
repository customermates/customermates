"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/core/utils/cn";

type DetailPanel = "details" | "notes" | "activities";

export function EntityDetailPanels({
  details,
  notes,
  activities,
  summary,
}: {
  details: ReactNode;
  notes?: ReactNode;
  activities?: ReactNode;
  summary?: ReactNode;
}) {
  const t = useTranslations();
  const id = useId();
  const [activePanel, setActivePanel] = useState<DetailPanel>("details");
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
            <Tabs value={selectedPanel} onValueChange={(value) => setActivePanel(value as DetailPanel)}>
              <TabsList
                aria-label={t("EntityDetail.overview")}
                className="h-13 w-full justify-stretch gap-0 rounded-none p-0 group-data-[orientation=horizontal]/tabs:h-13"
                variant="line"
              >
                {panels.map((panel) => (
                  <TabsTrigger
                    key={panel.key}
                    aria-controls={`${id}-${panel.key}-panel`}
                    className="h-full rounded-none px-4 after:z-10 group-data-[orientation=horizontal]/tabs:after:-bottom-px"
                    id={`${id}-${panel.key}-tab`}
                    value={panel.key}
                  >
                    {panel.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        <div
          data-detail-grid
          className={cn(
            "grid grid-cols-1 gap-px bg-border contain-[layout] @6xl/detail:flex-1 @6xl/detail:min-h-0",
            notes && activities && "@6xl/detail:grid-cols-[minmax(0,3fr)_minmax(0,2fr)_360px]",
            notes && !activities && "@6xl/detail:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
            !notes && activities && "@6xl/detail:grid-cols-[minmax(0,1fr)_360px]",
          )}
        >
          {panels.map((panel) => (
            <div
              key={panel.key}
              aria-label={
                hasTabs && isSplit
                  ? panel.key === "activities"
                    ? t("Common.actions.labelHistory")
                    : panel.label
                  : undefined
              }
              aria-labelledby={hasTabs && !isSplit ? `${id}-${panel.key}-tab` : undefined}
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
          ))}
        </div>
      </div>
    </div>
  );
}
