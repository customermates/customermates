import { cn } from "@/core/utils/cn";

import { planUsageLevel, planUsagePercent } from "./plan-usage-meter";

export type UsageMeterTone = "ok" | "full" | "approaching" | "over";

export function usageMeterTone(used: number, limit: number, warnApproaching: boolean): UsageMeterTone {
  if (limit > 0 && used > limit) return "over";
  const level = planUsageLevel(used, limit);
  if (warnApproaching && level !== "ok") return "approaching";
  return level === "reached" ? "full" : "ok";
}

const METER_FILL: Record<UsageMeterTone, string> = {
  ok: "bg-foreground/70",
  full: "bg-foreground/30",
  approaching: "bg-warning",
  over: "bg-destructive",
};

type Props = {
  id: string;
  label: string;
  value: string;
  used: number;
  limit: number;
  warnApproaching: boolean;
  compact?: boolean;
};

export function PlanUsageBar({ id, label, value, used, limit, warnApproaching, compact = false }: Props) {
  const level = planUsageLevel(used, limit);
  const tone = usageMeterTone(used, limit, warnApproaching);

  return (
    <div
      className={cn("flex flex-col", compact ? "gap-1" : "gap-1.5")}
      data-plan-usage={id}
      data-usage-level={level}
      data-usage-tone={tone}
    >
      <span className={cn("flex items-baseline justify-between gap-2", compact ? "text-[11px] leading-4" : "text-sm")}>
        <span className={compact ? "text-muted-foreground" : "text-foreground"}>{label}</span>

        <span
          className={cn(
            "shrink-0 tabular-nums",
            tone === "ok" || tone === "full" ? "text-muted-foreground" : "font-medium text-foreground",
          )}
        >
          {value}
        </span>
      </span>

      <span aria-hidden className={cn("block w-full overflow-hidden rounded-full bg-muted", compact ? "h-1" : "h-1.5")}>
        <span
          className={cn("block h-full rounded-full", METER_FILL[tone])}
          style={{ width: `${planUsagePercent(used, limit)}%` }}
        />
      </span>
    </div>
  );
}
