"use client";

import type { CompanyWidget } from "@/features/widget/widget.schema";
import type { WidgetGalleryTemplate } from "@/features/widget/widget-gallery";

import { useTranslations } from "next-intl";
import { Activity, ChartNoAxesColumnIncreasing } from "lucide-react";
import { WidgetKind } from "@/generated/prisma";

import { IconContainer } from "@/components/shared/icon-container";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/core/utils/cn";
import { ChartTypeIllustration } from "./widget-display-type-picker";

type Props = {
  availableKinds: WidgetKind[];
  disabled?: boolean;
  gallery: WidgetGalleryTemplate[];
  templates: CompanyWidget[];
  onSelectGalleryTemplate: (template: WidgetGalleryTemplate) => void;
  onSelectKind: (kind: WidgetKind) => void;
  onSelectTemplate: (id: string) => void;
};

const KIND_ICON = {
  [WidgetKind.chart]: ChartNoAxesColumnIncreasing,
  [WidgetKind.activityTimeline]: Activity,
};

export function WidgetStarterPicker({
  availableKinds,
  disabled,
  gallery,
  templates,
  onSelectGalleryTemplate,
  onSelectKind,
  onSelectTemplate,
}: Props) {
  const t = useTranslations();

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <section
        aria-label={t("Dashboard.widgetEditor.kind.title")}
        className="grid gap-2 sm:grid-cols-2"
        id="widget-modal-kind"
      >
        {availableKinds.map((kind) => {
          const KindIcon = KIND_ICON[kind];
          return (
            <button
              key={kind}
              className={cn(
                "interactive-surface group flex min-h-24 flex-col items-start gap-2.5 rounded-md border border-input bg-input-background p-3 text-left shadow-xs",
                "hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
              )}
              disabled={disabled}
              id={`widget-kind-${kind}`}
              type="button"
              onClick={() => onSelectKind(kind)}
            >
              <IconContainer icon={KindIcon} />

              <span className="space-y-1">
                <span className="block text-sm font-medium text-foreground">{t(`Dashboard.widgetKinds.${kind}`)}</span>

                <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                  {t(`Dashboard.widgetEditor.kind.${kind}Description`)}
                </span>
              </span>
            </button>
          );
        })}
      </section>

      {gallery.length > 0 && (
        <section aria-labelledby="widget-gallery-heading" className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium" id="widget-gallery-heading">
              {t("Dashboard.widgetGallery.title")}
            </h3>

            <p className="text-xs leading-relaxed text-muted-foreground">{t("Dashboard.widgetGallery.description")}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {gallery.map((template) => (
              <button
                key={template.key}
                className={cn(
                  "interactive-surface flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 text-left",
                  "hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                )}
                disabled={disabled}
                id={`widget-gallery-${template.key}`}
                type="button"
                onClick={() => onSelectGalleryTemplate(template)}
              >
                <ChartTypeIllustration className="h-10 w-14 shrink-0" type={template.displayOptions.displayType} />

                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t(`Dashboard.widgetGallery.templates.${template.key}.name`)}
                  </span>

                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    {t(`Dashboard.widgetGallery.templates.${template.key}.description`)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {templates.length > 0 && (
        <section aria-labelledby="widget-template-heading" className="space-y-3">
          <div className="space-y-1">
            <h3 className="text-sm font-medium" id="widget-template-heading">
              {t("Dashboard.widgetEditor.templates.title")}
            </h3>

            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("Dashboard.widgetEditor.templates.description")}
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {templates.map((widget) => {
              const ownerName = `${widget.firstName} ${widget.lastName}`.trim();
              return (
                <button
                  key={widget.id}
                  className={cn(
                    "interactive-surface flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 text-left",
                    "hover:border-primary/60 hover:bg-primary/5 focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  )}
                  disabled={disabled}
                  id={`widget-template-${widget.id}`}
                  type="button"
                  onClick={() => onSelectTemplate(widget.id)}
                >
                  <Avatar name={[widget.firstName, widget.lastName]} size="lg" src={widget.avatarUrl} />

                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block truncate text-sm font-medium text-foreground">{widget.name}</span>

                    <span className="block truncate text-xs text-muted-foreground">
                      {t("Dashboard.widgetEditor.templates.by", {
                        name: ownerName,
                      })}
                    </span>
                  </span>

                  <Badge variant="secondary">{t(`Dashboard.widgetKinds.${widget.kind}`)}</Badge>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
