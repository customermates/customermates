"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";
import type { StandardSetupList } from "./setup-plan-summary";

import { ChartArea, ChartBar, ChartColumn, ChartPie, FileText, Filter, Hash, ListOrdered, Radar } from "lucide-react";
import { useTranslations } from "next-intl";

import { AppChip } from "@/components/chip/app-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { cn } from "@/core/utils/cn";

const DISPLAY_ICONS: Record<string, LucideIcon> = {
  number: Hash,
  verticalBarChart: ChartColumn,
  horizontalBarChart: ChartBar,
  areaChart: ChartArea,
  rankedTable: ListOrdered,
  doughnutChart: ChartPie,
  funnelChart: Filter,
  radarChart: Radar,
};

const TILE_SPANS: Record<string, string> = {
  small: "col-span-1",
  medium: "col-span-1 @2xl/sketch:col-span-2",
  large: "col-span-2",
  wide: "col-span-2 @2xl/sketch:col-span-4",
};

const BAR_HEIGHTS = ["h-1/3", "h-2/3", "h-1/2", "h-full", "h-3/4"];

export function useStandardListNames(): Record<StandardSetupList, string> {
  const t = useTranslations();
  return {
    contact: t("WorkspaceSetup.plan.standardLists.contact"),
    organization: t("WorkspaceSetup.plan.standardLists.organization"),
    deal: t("WorkspaceSetup.plan.standardLists.deal"),
    service: t("WorkspaceSetup.plan.standardLists.service"),
    task: t("WorkspaceSetup.plan.standardLists.task"),
    lineItem: t("WorkspaceSetup.plan.standardLists.lineItem"),
  };
}

export function PreviewPanel({
  title,
  icon: Icon,
  children,
  className,
  busy = false,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  className?: string;
  busy?: boolean;
}) {
  return (
    <section
      aria-busy={busy}
      aria-label={title}
      className={cn("flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4", className)}
    >
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <Icon aria-hidden className="size-4 text-muted-foreground" />

        {title}
      </h3>

      {children}
    </section>
  );
}

export function PreviewListChip({
  label,
  icon,
  color,
  className,
}: {
  label: string;
  icon: string;
  color: ChipColor | null;
  className?: string;
}) {
  return (
    <AppChip
      className={cn("animate-page-result-in motion-reduce:animate-none", className)}
      startContent={<RecordTypeGlyph className="size-3 text-current" icon={icon} />}
      variant={color ?? "secondary"}
    >
      {label}
    </AppChip>
  );
}

export function PlaceholderLine({ className, pulse = false }: { className?: string; pulse?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("block h-2 rounded-full bg-muted", pulse && "animate-pulse motion-reduce:animate-none", className)}
    />
  );
}

export type BoardStage = { label: string; color: ChipColor | null; weight?: number | null };

export function PipelineBoard({
  stages,
  records = [],
  pulse = false,
}: {
  stages: BoardStage[];
  records?: string[];
  pulse?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {stages.map((stage, index) => {
        const cards = records.filter((_, at) => at % stages.length === index);
        return (
          <div
            key={`${stage.label}-${index}`}
            className="flex min-w-[6.5rem] flex-1 animate-page-result-in flex-col gap-2 rounded-lg bg-muted/60 p-2 motion-reduce:animate-none"
          >
            <div className="flex items-center justify-between gap-1">
              <AppChip variant={stage.color ?? "secondary"}>{stage.label}</AppChip>

              {stage.weight !== null && stage.weight !== undefined ? (
                <span className="text-[11px] text-muted-foreground">
                  {t("WorkspaceSetup.plan.winChanceValue", { value: stage.weight })}
                </span>
              ) : null}
            </div>

            {cards.length
              ? cards.map((title) => (
                  <div
                    key={title}
                    className="animate-page-result-in truncate rounded-md border border-border bg-card px-2 py-1.5 text-xs shadow-xs motion-reduce:animate-none"
                  >
                    {title}
                  </div>
                ))
              : [0, 1].slice(0, index % 2 === 0 ? 2 : 1).map((slot) => (
                  <div key={slot} className="rounded-md border border-border bg-card p-2">
                    <PlaceholderLine className="w-3/4" pulse={pulse} />
                  </div>
                ))}
          </div>
        );
      })}
    </div>
  );
}

export type DashboardTile = { key: string; title: string; display: string; size?: string | null };

export function DashboardSketch({ tiles, pulse = false }: { tiles: DashboardTile[]; pulse?: boolean }) {
  return (
    <div className="@container/sketch">
      <div className="grid grid-cols-2 gap-2 @2xl/sketch:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = DISPLAY_ICONS[tile.display] ?? ChartColumn;
          const numeric = tile.display === "number";
          return (
            <div
              key={tile.key}
              className={cn(
                "flex min-h-24 animate-page-result-in flex-col gap-2 rounded-lg border border-border bg-background p-2.5 motion-reduce:animate-none",
                TILE_SPANS[tile.size ?? (numeric ? "small" : "medium")] ?? "col-span-1",
              )}
            >
              <div className="flex items-start gap-1.5 text-xs font-medium">
                <Icon aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />

                <span className="line-clamp-2 min-w-0 break-words">{tile.title}</span>
              </div>

              {numeric ? (
                <PlaceholderLine className="mt-auto h-4 w-1/2 bg-primary/25" pulse={pulse} />
              ) : (
                <div aria-hidden className="mt-auto flex h-10 items-end gap-1">
                  {BAR_HEIGHTS.map((height, bar) => (
                    <span
                      key={bar}
                      className={cn(
                        "flex-1 rounded-sm bg-primary/30",
                        height,
                        pulse && "animate-pulse motion-reduce:animate-none",
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VISIBLE_PAGE_TITLES = 8;

export function KnowledgePageList({ titles }: { titles: string[] }) {
  const t = useTranslations();
  const hidden = titles.length - VISIBLE_PAGE_TITLES;
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {titles.slice(0, VISIBLE_PAGE_TITLES).map((title) => (
        <li
          key={title}
          className="flex min-w-0 animate-page-result-in items-center gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs motion-reduce:animate-none"
        >
          <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />

          <span className="truncate">{title}</span>
        </li>
      ))}

      {hidden > 0 ? (
        <li className="flex items-center px-2.5 py-1.5 text-xs text-muted-foreground">
          {t("WorkspaceSetup.plan.morePages", { count: hidden })}
        </li>
      ) : null}
    </ul>
  );
}
