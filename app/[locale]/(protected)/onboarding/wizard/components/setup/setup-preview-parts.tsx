"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ChipColor } from "@/constants/chip-colors";

import { FileText } from "lucide-react";
import { useTranslations } from "next-intl";

import { ChartTypeIllustration } from "@/app/[locale]/(protected)/dashboard/components/widget-display-type-picker";
import { AppChip } from "@/components/chip/app-chip";
import { RecordTypeGlyph } from "@/components/records/record-type-glyph";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget.schema";

const TILE_SPANS: Record<string, string> = {
  small: "col-span-1",
  medium: "col-span-1 @2xl/sketch:col-span-2",
  large: "col-span-2",
  wide: "col-span-2 @2xl/sketch:col-span-4",
};

const DISPLAY_TYPES = new Set<string>(Object.values(DisplayType));

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
    <Card aria-busy={busy} aria-label={title} className={cn("min-w-0 gap-4", className)} role="region">
      <CardHeader>
        <CardTitle>
          <h3 className="flex items-center gap-2 text-sm">
            <Icon aria-hidden className="size-4 text-muted-foreground" />

            {title}
          </h3>
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-w-0 flex-col gap-3">{children}</CardContent>
    </Card>
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
  return <Skeleton aria-hidden animated={pulse} className={cn("h-2", className)} />;
}

export type BoardStage = { label: string; color: ChipColor | null; weight?: number | null };

export function PipelineBoard({
  stages,
  records = [],
  pulse = false,
  placeholders = true,
}: {
  stages: BoardStage[];
  records?: { title: string; stage: string | null }[];
  pulse?: boolean;
  placeholders?: boolean;
}) {
  const t = useTranslations();
  const staged = records.some((record) => stages.some((stage) => stage.label === record.stage));
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-x-1.5 gap-y-3">
      {stages.map((stage, index) => {
        const cards = records
          .filter((record, at) => (staged ? record.stage === stage.label : at % stages.length === index))
          .map((record) => record.title);
        return (
          <div
            key={`${stage.label}-${index}`}
            className="flex min-w-0 animate-page-result-in flex-col gap-2 motion-reduce:animate-none"
          >
            <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
              <AppChip variant={stage.color ?? "secondary"}>{stage.label}</AppChip>

              {stage.weight !== null && stage.weight !== undefined ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {t("WorkspaceSetup.plan.winChanceValue", { value: stage.weight })}
                </span>
              ) : null}
            </div>

            {cards.length
              ? cards.map((title) => (
                  <Card key={title} className="animate-page-result-in gap-0 py-2 motion-reduce:animate-none">
                    <CardContent className="px-2 text-xs break-words">{title}</CardContent>
                  </Card>
                ))
              : placeholders
                ? [0, 1].slice(0, index % 2 === 0 ? 2 : 1).map((slot) => (
                    <Card key={slot} className="gap-0 py-3">
                      <CardContent className="px-2">
                        <PlaceholderLine className="w-3/4" pulse={pulse} />
                      </CardContent>
                    </Card>
                  ))
                : null}
          </div>
        );
      })}
    </div>
  );
}

export type DashboardTile = { key: string; title: string; display: string; size?: string | null };

export function DashboardSketch({ tiles }: { tiles: DashboardTile[] }) {
  return (
    <div className="@container/sketch">
      <div className="grid grid-cols-2 gap-2 @2xl/sketch:grid-cols-4">
        {tiles.map((tile) => {
          const display = DISPLAY_TYPES.has(tile.display)
            ? (tile.display as DisplayType)
            : DisplayType.verticalBarChart;
          return (
            <div
              key={tile.key}
              className={cn(
                "flex min-h-28 min-w-0 animate-page-result-in flex-col gap-3 rounded-lg border border-border p-3 motion-reduce:animate-none",
                TILE_SPANS[tile.size ?? (display === DisplayType.number ? "small" : "medium")] ?? "col-span-1",
              )}
            >
              <span className="text-xs font-medium [overflow-wrap:anywhere]">{tile.title}</span>

              <ChartTypeIllustration className="mt-auto h-10 w-full" type={display} />
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
    <ul className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
      {titles.slice(0, VISIBLE_PAGE_TITLES).map((title) => (
        <li
          key={title}
          className="flex min-w-0 animate-page-result-in items-start gap-2 text-sm motion-reduce:animate-none"
        >
          <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

          <span className="min-w-0 [overflow-wrap:anywhere]">{title}</span>
        </li>
      ))}

      {hidden > 0 ? (
        <li className="text-sm text-muted-foreground">{t("WorkspaceSetup.plan.morePages", { count: hidden })}</li>
      ) : null}
    </ul>
  );
}
