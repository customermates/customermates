import type { LucideIcon } from "lucide-react";
import type { AutomationStepTone } from "./automation-canvas-types";

import { cn } from "@/core/utils/cn";

const TONE_CLASS: Record<AutomationStepTone, string> = {
  trigger: "bg-info/12 text-info-soft-foreground ring-1 ring-info/25",
  condition: "bg-warning/12 text-warning-soft-foreground ring-1 ring-warning/25",
  action: "bg-card text-foreground ring-1 ring-border-strong",
  agent: "bg-primary text-primary-foreground ring-1 ring-primary",
  empty: "border border-dashed border-border-strong bg-card text-muted-foreground",
};

export function AutomationStepDot({
  tone,
  icon: Icon,
  size = "sm",
}: {
  tone: AutomationStepTone;
  icon: LucideIcon;
  size?: "sm" | "md";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" ? "size-6" : "size-8",
        TONE_CLASS[tone],
      )}
    >
      <Icon className={size === "sm" ? "size-3" : "size-4"} />
    </span>
  );
}
