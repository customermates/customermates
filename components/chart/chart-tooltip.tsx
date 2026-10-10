"use client";

import type { TooltipProps } from "recharts";

import { Tooltip } from "recharts";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useRecordValueFormat } from "@/app/[locale]/(protected)/records/[typeId]/components/record-value";

type TooltipContentProps = {
  active?: boolean;
  currency?: string | null;
  label?: string | number;
  payload?: ReadonlyArray<{
    name?: string;
    payload?: {
      color?: string;
      fill?: string;
      label?: string;
      formattedValue?: string;
    };
    value?: number;
  }>;
};

const BASE_CLASS =
  "rounded-md border border-tooltip-foreground/10 bg-tooltip px-3 py-2 text-tooltip-foreground shadow-lg";

const TooltipContent = observer((props: TooltipContentProps) => {
  const { active, currency, label, payload } = props;
  const valueFormat = useRecordValueFormat();
  const t = useTranslations();

  if (!active || !payload || payload.length === 0) return null;

  const isPieChart = payload.length > 0 && payload[0].name && payload[0].name !== "value";
  const format = (value: number) =>
    currency !== undefined ? valueFormat.decimal(value, { currency }) : valueFormat.number(value);

  if (payload.length === 1) {
    const entry = payload[0];
    const value = typeof entry.value === "number" ? entry.value : 0;
    const color = entry.payload?.color || entry.payload?.fill;
    const title = isPieChart ? entry.name || entry.payload?.label : (label ?? entry.payload?.label);

    return (
      <div className={BASE_CLASS}>
        <div className="flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            {color && <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}

            {title !== undefined && title !== "" && <span className="font-semibold truncate">{String(title)}</span>}
          </div>

          <span className="font-medium tabular-nums whitespace-nowrap">
            {entry.payload?.formattedValue ?? format(value)}
          </span>
        </div>
      </div>
    );
  }

  const total = payload.reduce((sum, entry) => sum + (typeof entry.value === "number" ? entry.value : 0), 0);

  return (
    <div className={`${BASE_CLASS} min-w-[180px]`}>
      {label && <div className="mb-2 text-sm font-semibold">{String(label)}</div>}

      <div className="flex flex-col gap-1.5">
        {payload.map((entry, index) => {
          const value = typeof entry.value === "number" ? entry.value : 0;
          const color = entry.payload?.color || entry.payload?.fill;
          const name = isPieChart ? entry.name || entry.payload?.label : entry.payload?.label;

          return (
            <div key={index} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                {color && <div className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}

                {name && <span className="text-tooltip-foreground/65 truncate">{String(name)}</span>}
              </div>

              <span className="font-medium tabular-nums whitespace-nowrap">
                {entry.payload?.formattedValue ?? format(value)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="my-2 border-t border-tooltip-foreground/10" />

      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-tooltip-foreground/65">{t("Diagrams.total")}</span>

        <span className="font-semibold tabular-nums whitespace-nowrap">{format(total)}</span>
      </div>
    </div>
  );
});

type Props = TooltipProps<number, string> & {
  currency?: string | null;
};

export function ChartTooltip({ currency, ...props }: Props) {
  return (
    <Tooltip
      content={(tooltipProps) => <TooltipContent currency={currency} {...tooltipProps} />}
      cursor={false}
      {...props}
    />
  );
}
