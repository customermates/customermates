"use client";

import type { ReactElement, ReactNode } from "react";
import type { CompanyWidget } from "@/features/widget/widget.schema";
import type { WidgetGalleryTemplate } from "@/features/widget/widget-gallery";

import { useTranslations } from "next-intl";
import { WidgetKind } from "@/generated/prisma";

import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget.schema";
import { WIDGET_GALLERY_CREATED_AT_LABEL } from "@/features/widget/widget-gallery";
import { ChartTypeIllustration } from "./widget-display-type-picker";

type Props = {
  availableKinds: WidgetKind[];
  disabled?: boolean;
  gallery: WidgetGalleryTemplate[];
  templates: CompanyWidget[];
  typeLabel: (typeId: string) => string | undefined;
  onSelectGalleryTemplate: (template: WidgetGalleryTemplate) => void;
  onSelectKind: (kind: WidgetKind) => void;
  onSelectTemplate: (id: string) => void;
};

export function useStarterText() {
  const t = useTranslations();
  return (template: WidgetGalleryTemplate) => {
    const { labels } = template;
    const values = {
      type: labels.type,
      field: labels.field ?? "",
      group: labels.group ?? "",
      related: labels.related ?? "",
      date:
        labels.date === WIDGET_GALLERY_CREATED_AT_LABEL
          ? t("Dashboard.widgetGallery.creationDate")
          : (labels.date ?? ""),
    };
    return {
      name: t(`Dashboard.widgetGallery.recipes.${template.recipe}.name`, values),
      description: t(`Dashboard.widgetGallery.recipes.${template.recipe}.description`, values),
    };
  };
}

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
};

export function WidgetStarterPicker({
  availableKinds,
  disabled,
  gallery,
  templates,
  typeLabel,
  onSelectGalleryTemplate,
  onSelectKind,
  onSelectTemplate,
}: Props) {
  const t = useTranslations();
  const starterText = useStarterText();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {gallery.length > 0 && (
        <ChooserSection
          heading={
            <ChooserHeading
              description={t("Dashboard.widgetGallery.description")}
              id="widget-gallery-heading"
              title={t("Dashboard.widgetGallery.title")}
            />
          }
        >
          {gallery.map((template, index) => {
            const repeat = gallery.slice(0, index).filter((other) => other.recipe === template.recipe).length;
            const source = typeLabel(template.measure.source.typeId) ?? template.labels.type;
            const text = starterText(template);
            return (
              <ChooserCard
                key={template.key}
                description={text.description}
                disabled={disabled}
                id={`widget-gallery-${template.recipe}${repeat ? `-${repeat + 1}` : ""}`}
                meta={<Badge variant="secondary">{source}</Badge>}
                preview={<ChartTypeIllustration className="size-full" type={template.displayOptions.displayType} />}
                title={text.name}
                onSelect={() => onSelectGalleryTemplate(template)}
              />
            );
          })}
        </ChooserSection>
      )}

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
        {availableKinds.map((kind) => (
          <ChooserCard
            key={kind}
            description={t(`Dashboard.widgetEditor.kind.${kind}Description`)}
            disabled={disabled}
            id={`widget-kind-${kind}`}
            preview={KIND_PREVIEW[kind]}
            title={t(`Dashboard.widgetKinds.${kind}`)}
            onSelect={() => onSelectKind(kind)}
          />
        ))}
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
