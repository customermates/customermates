"use client";

import type { ReactElement, ReactNode } from "react";
import type { CompanyWidget } from "@/features/widget/widget.schema";
import type { CalendarWidgetLayout } from "@/features/widget/record-calendar-widget.schema";

import { useTranslations } from "next-intl";
import { WidgetKind } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget.schema";
import { WIDGET_STARTER_DISPLAY_TYPES } from "@/features/widget/widget-display-rules";
import { ChartTypeIllustration } from "./widget-display-type-picker";

export type WidgetStarterChoice = { displayType?: DisplayType; calendarLayout?: CalendarWidgetLayout };

type Props = {
  availableKinds: WidgetKind[];
  disabled?: boolean;
  templates: CompanyWidget[];
  onSelectKind: (kind: WidgetKind, choice?: WidgetStarterChoice) => void;
  onSelectTemplate: (id: string) => void;
};

const HEAT_CELLS = [0, 1, 0, 2, 0, 0, 1, 3, 0, 1, 0, 4, 2, 0, 0, 2, 1, 0, 3, 0, 1, 1, 0, 0, 2, 0, 4, 0];
const HEAT_CELL_CLASS = ["bg-border", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"];
const MAP_PINS = [
  { position: "left-[22%] top-[30%]", color: "bg-(--chart-1)" },
  { position: "left-[48%] top-[22%]", color: "bg-(--chart-2)" },
  { position: "left-[64%] top-[52%]", color: "bg-(--chart-3)" },
  { position: "left-[36%] top-[64%]", color: "bg-(--chart-4)" },
];

export function ActivityTimelineIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col justify-center gap-2", className)}>
      {["w-4/5", "w-3/5", "w-2/3"].map((width, index) => (
        <div key={width} className="flex items-center gap-2">
          <span className={cn("size-2.5 shrink-0 rounded-full bg-primary", index > 0 && "bg-primary/55")} />

          <span className="flex flex-1 flex-col gap-1">
            <span className={cn("h-1.5 rounded-full bg-border-strong", width)} />

            <span className="h-1 w-1/3 rounded-full bg-border" />
          </span>
        </div>
      ))}
    </div>
  );
}

export function CalendarUpcomingIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col justify-center gap-2", className)}>
      {["w-4/5", "w-3/5", "w-2/3"].map((width, index) => (
        <div key={width} className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-4 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[3px] border border-border-strong",
              index === 0 && "border-destructive",
            )}
          >
            <span className={cn("h-0.5 w-2 rounded-full bg-border-strong", index === 0 && "bg-destructive")} />

            <span className={cn("h-0.5 w-1.5 rounded-full bg-border", index === 0 && "bg-destructive/50")} />
          </span>

          <span className="flex flex-1 flex-col gap-1">
            <span className={cn("h-1.5 rounded-full bg-border-strong", width)} />

            <span className={cn("h-1 w-1/3 rounded-full bg-border", index === 0 && "bg-destructive/50")} />
          </span>

          {index > 0 && <span className="h-1.5 w-3 shrink-0 rounded-full bg-primary/55" />}
        </div>
      ))}
    </div>
  );
}

export function CalendarMonthIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center justify-center", className)}>
      <div className="grid w-24 grid-cols-7 gap-0.5">
        {HEAT_CELLS.map((level, index) => (
          <span
            key={index}
            className={cn("aspect-square rounded-[2px]", HEAT_CELL_CLASS[level], index === 11 && "ring-1 ring-ring")}
          />
        ))}
      </div>
    </div>
  );
}

export function MapIllustration({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex items-center justify-center", className)}>
      <div className="relative h-14 w-24 overflow-hidden rounded-md bg-info/10">
        <span className="absolute -left-2 top-2 h-9 w-14 rounded-[45%] border border-border-strong bg-card" />

        <span className="absolute left-10 top-5 h-12 w-16 rounded-[40%] border border-border-strong bg-card" />

        {MAP_PINS.map((pin) => (
          <span
            key={pin.position}
            className={cn("absolute size-2.5 rounded-full shadow-xs ring-2 ring-card", pin.position, pin.color)}
          />
        ))}

        <span className="absolute left-[74%] top-[18%] flex size-4 items-center justify-center rounded-full bg-primary ring-2 ring-card">
          <span className="size-1 rounded-full bg-primary-foreground" />
        </span>
      </div>
    </div>
  );
}

type CardProps = {
  description?: string;
  disabled?: boolean;
  id: string;
  meta?: ReactNode;
  preview: ReactNode;
  title: string;
  onSelect: () => void;
};

function ChooserCard({ description, disabled, id, meta, preview, title, onSelect }: CardProps) {
  return (
    <button
      className={cn(
        "interactive-surface group flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 text-left shadow-xs",
        "hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-60",
      )}
      data-slot="widget-chooser-card"
      disabled={disabled}
      id={id}
      type="button"
      onClick={onSelect}
    >
      <span
        aria-hidden
        className="flex h-20 w-full items-center justify-center rounded-md border border-border/60 bg-muted/40 px-6 py-3 transition-colors group-hover:bg-primary/10"
      >
        <span className="flex size-full max-w-32 items-center justify-center">{preview}</span>
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="block truncate text-sm font-medium text-foreground">{title}</span>

        {description && (
          <span className="line-clamp-2 block text-xs leading-relaxed text-muted-foreground">{description}</span>
        )}
      </span>

      {meta && <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">{meta}</span>}
    </button>
  );
}

function ChooserHeading({ description, id, title }: { description: string; id: string; title: string }) {
  return (
    <div className="space-y-1">
      <h3 className="text-sm font-medium" id={id}>
        {title}
      </h3>

      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

function ChooserSection({
  children,
  heading,
  id,
}: {
  children: ReactNode;
  heading: ReactElement<{ id: string }>;
  id?: string;
}) {
  return (
    <section aria-labelledby={heading.props.id} className="space-y-3" id={id}>
      {heading}

      <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 md:grid-cols-3">{children}</div>
    </section>
  );
}

const KIND_PREVIEW: Record<WidgetKind, ReactNode> = {
  [WidgetKind.chart]: <ChartTypeIllustration className="size-full" type={DisplayType.verticalBarChart} />,
  [WidgetKind.activityTimeline]: <ActivityTimelineIllustration className="size-full" />,
  [WidgetKind.calendar]: <CalendarUpcomingIllustration className="size-full" />,
  [WidgetKind.map]: <MapIllustration className="size-full" />,
};

export function WidgetStarterPicker({ availableKinds, disabled, templates, onSelectKind, onSelectTemplate }: Props) {
  const t = useTranslations();
  const chartAvailable = availableKinds.includes(WidgetKind.chart);
  const calendarStarters: Array<{
    layout: CalendarWidgetLayout;
    title: string;
    description: string;
    preview: ReactNode;
  }> = [
    {
      layout: "upcoming",
      title: t("Dashboard.widgetEditor.starters.calendar.upcoming.title"),
      description: t("Dashboard.widgetEditor.starters.calendar.upcoming.description"),
      preview: <CalendarUpcomingIllustration className="size-full" />,
    },
    {
      layout: "month",
      title: t("Dashboard.widgetEditor.starters.calendar.month.title"),
      description: t("Dashboard.widgetEditor.starters.calendar.month.description"),
      preview: <CalendarMonthIllustration className="size-full" />,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ChooserSection
        heading={
          <ChooserHeading
            description={t("Dashboard.widgetEditor.kind.description")}
            id="widget-modal-kind-heading"
            title={t("Dashboard.widgetEditor.kind.scratchTitle")}
          />
        }
        id="widget-modal-kind"
      >
        {chartAvailable &&
          WIDGET_STARTER_DISPLAY_TYPES.map((displayType) => (
            <ChooserCard
              key={displayType}
              description={t(`Dashboard.widgetEditor.starters.${displayType}.description`)}
              disabled={disabled}
              id={`widget-starter-${displayType}`}
              preview={<ChartTypeIllustration className="size-full" type={displayType} />}
              title={t(`Dashboard.widgetEditor.starters.${displayType}.title`)}
              onSelect={() => onSelectKind(WidgetKind.chart, { displayType })}
            />
          ))}

        {availableKinds.includes(WidgetKind.calendar) &&
          calendarStarters.map(({ layout, title, description, preview }) => (
            <ChooserCard
              key={layout}
              description={description}
              disabled={disabled}
              id={`widget-kind-calendar-${layout}`}
              preview={preview}
              title={title}
              onSelect={() => onSelectKind(WidgetKind.calendar, { calendarLayout: layout })}
            />
          ))}

        {availableKinds.includes(WidgetKind.map) && (
          <ChooserCard
            description={t("Dashboard.widgetEditor.starters.map.description")}
            disabled={disabled}
            id={`widget-kind-${WidgetKind.map}`}
            preview={KIND_PREVIEW[WidgetKind.map]}
            title={t("Dashboard.widgetEditor.starters.map.title")}
            onSelect={() => onSelectKind(WidgetKind.map)}
          />
        )}

        {availableKinds.includes(WidgetKind.activityTimeline) && (
          <ChooserCard
            description={t("Dashboard.widgetEditor.kind.activityTimelineDescription")}
            disabled={disabled}
            id={`widget-kind-${WidgetKind.activityTimeline}`}
            preview={KIND_PREVIEW[WidgetKind.activityTimeline]}
            title={t("Dashboard.widgetKinds.activityTimeline")}
            onSelect={() => onSelectKind(WidgetKind.activityTimeline)}
          />
        )}
      </ChooserSection>

      {templates.length > 0 && (
        <ChooserSection
          heading={
            <ChooserHeading
              description={t("Dashboard.widgetEditor.templates.description")}
              id="widget-template-heading"
              title={t("Dashboard.widgetEditor.templates.title")}
            />
          }
        >
          {templates.map((widget) => {
            const ownerName = `${widget.firstName} ${widget.lastName}`.trim();
            return (
              <ChooserCard
                key={widget.id}
                disabled={disabled}
                id={`widget-template-${widget.id}`}
                meta={
                  <>
                    <Avatar name={[widget.firstName, widget.lastName]} size="sm" src={widget.avatarUrl} />

                    <span className="min-w-0 truncate">
                      {t("Dashboard.widgetEditor.templates.by", { name: ownerName })}
                    </span>
                  </>
                }
                preview={KIND_PREVIEW[widget.kind]}
                title={widget.name}
                onSelect={() => onSelectTemplate(widget.id)}
              />
            );
          })}
        </ChooserSection>
      )}
    </div>
  );
}
