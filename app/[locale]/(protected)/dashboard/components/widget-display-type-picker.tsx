"use client";

import { useTranslations } from "next-intl";
import { Radar } from "lucide-react";

import { SelectableCard } from "@/components/forms/selectable-card";
import { RadioGroup } from "@/components/ui/radio-group";
import { cn } from "@/core/utils/cn";
import { DisplayType } from "@/features/widget/widget.schema";

type IllustrationProps = {
  className?: string;
  type: DisplayType;
};

function ChartTypeIllustration({ className, type }: IllustrationProps) {
  if (type === DisplayType.doughnutChart) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <div className="size-12 rounded-full border-[9px] border-primary/20 border-r-primary border-t-primary" />
      </div>
    );
  }

  if (type === DisplayType.radarChart) {
    return (
      <div className={cn("flex items-center justify-center", className)}>
        <Radar aria-hidden className="size-14 stroke-[1.4] text-primary" />
      </div>
    );
  }

  const horizontal = type === DisplayType.horizontalBarChart || type === DisplayType.horizontalBarChartWithLabels;
  const withLabels =
    type === DisplayType.verticalBarChartWithLabels || type === DisplayType.horizontalBarChartWithLabels;

  if (horizontal) {
    return (
      <div className={cn("flex flex-col justify-center gap-2", className)}>
        {["w-4/5", "w-3/5", "w-full"].map((width, index) => (
          <div key={width} className="flex items-center gap-1.5">
            {withLabels && <span className="h-1.5 w-5 rounded-full bg-border-strong" />}

            <span className={cn("h-2.5 rounded-sm bg-primary", width, index === 1 && "bg-primary/55")} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex items-end justify-center gap-2", className)}>
      {["h-2/5", "h-4/5", "h-3/5", "h-full"].map((height, index) => (
        <div key={height} className="flex h-full flex-col items-center justify-end gap-1">
          <span className={cn("w-3 rounded-sm bg-primary", height, index === 2 && "bg-primary/55")} />

          {withLabels && <span className="h-1 w-3 rounded-full bg-border-strong" />}
        </div>
      ))}
    </div>
  );
}

type Props = {
  disabled?: boolean;
  value: DisplayType;
  onValueChange: (value: DisplayType) => void;
};

export function WidgetDisplayTypePicker({ disabled, value, onValueChange }: Props) {
  const t = useTranslations();

  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-xs font-normal leading-none text-muted-foreground">
        {t("Dashboard.widgetEditor.appearance.chartStyle")}
      </legend>

      <RadioGroup
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        disabled={disabled}
        value={value}
        onValueChange={(next) => onValueChange(next as DisplayType)}
      >
        {Object.values(DisplayType).map((type) => {
          const id = `display-type-${type}`;
          return (
            <SelectableCard
              key={type}
              disabled={disabled}
              id={id}
              label={t(`Dashboard.displayTypes.${type}`)}
              labelClassName="min-h-28 gap-2"
              selectionMode="single"
              value={type}
              visual={<ChartTypeIllustration className="h-14 w-full" type={type} />}
            />
          );
        })}
      </RadioGroup>
    </fieldset>
  );
}
